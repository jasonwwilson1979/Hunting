import hashlib
import json
import shutil
import tempfile
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings

from .models import MapDocument

SAMPLE = Path(__file__).resolve().parents[2] / "tests" / "sample-topo-map.pdf"
MEDIA_TMP = tempfile.mkdtemp(prefix="huntmap-test-media-")


def tearDownModule():
    shutil.rmtree(MEDIA_TMP, ignore_errors=True)


@override_settings(MEDIA_ROOT=MEDIA_TMP, HUNTMAP_TOKEN="")
class MapLibraryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(
            "tester", "tester@example.com", "huntmap-pass", is_staff=True)

    # ------------------------------------------------------------------ app files
    def test_app_shell_is_served(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response["Content-Type"])
        body = response.content.decode("utf-8")
        self.assertIn("HuntMap", body)
        # The marker lets the app know a map server is present.
        self.assertIn("__HUNTMAP_SERVER__", body)

    def test_app_assets_are_served(self):
        js = self.client.get("/js/app.js")
        self.assertEqual(js.status_code, 200)
        self.assertIn("javascript", js["Content-Type"])

        worker = self.client.get("/sw.js")
        self.assertEqual(worker.status_code, 200)
        self.assertEqual(worker["Service-Worker-Allowed"], "/")

    def test_non_app_files_are_hidden(self):
        for path in ("/README.md", "/server/manage.py", "/.gitignore"):
            response = self.client.get(path)
            self.assertIn(response.status_code, (404, 301), path)

    def test_api_is_not_shadowed_by_the_catch_all(self):
        response = self.client.get("/api/maps/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["server"], "huntmap")

    def test_health_endpoint(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["maps"], 0)

    def test_health_accepts_local_probe_hosts(self):
        """Docker's HEALTHCHECK and uptime monitors connect to 127.0.0.1.

        With HUNTMAP_HOSTS pinned to a public name (proxy / Cloudflare Tunnel),
        the loopback probe must still be accepted or the container never goes
        healthy.
        """
        for host in ("127.0.0.1:8000", "localhost:8000", "127.0.0.1:8443"):
            response = self.client.get("/api/health/", HTTP_HOST=host)
            self.assertEqual(response.status_code, 200, host)

    # ---------------------------------------------------------------------- api
    def test_upload_then_list_and_download(self):
        data = SAMPLE.read_bytes()
        upload = SimpleUploadedFile("sample-topo-map.pdf", data, content_type="application/pdf")
        response = self.client.post("/api/maps/", {"file": upload, "name": "Test Topo", "page": 2})
        self.assertEqual(response.status_code, 201, response.content)
        payload = response.json()
        self.assertEqual(payload["name"], "Test Topo")
        self.assertEqual(payload["kind"], "pdf")
        self.assertEqual(payload["ext"], ".pdf")
        self.assertEqual(payload["page"], 2)
        self.assertEqual(payload["size"], len(data))
        self.assertEqual(payload["sha256"], hashlib.sha256(data).hexdigest())

        listing = self.client.get("/api/maps/").json()
        self.assertEqual(len(listing["maps"]), 1)
        self.assertEqual(listing["maps"][0]["id"], payload["id"])

        download = self.client.get("/api/maps/%d/file" % payload["id"])
        self.assertEqual(download.status_code, 200)
        self.assertEqual(download["Content-Type"], "application/pdf")
        self.assertEqual(b"".join(download.streaming_content), data)

    def test_upload_rejects_unsupported_files(self):
        upload = SimpleUploadedFile("notes.txt", b"hello", content_type="text/plain")
        response = self.client.post("/api/maps/", {"file": upload})
        self.assertEqual(response.status_code, 400)
        self.assertIn("PDF", response.json()["error"])

    def test_upload_requires_a_file(self):
        response = self.client.post("/api/maps/", {"name": "nothing"})
        self.assertEqual(response.status_code, 400)

    def _make_doc(self, name="Cal"):
        doc = MapDocument.objects.create(name=name, page=1)
        doc.file.save(name + ".pdf",
                      SimpleUploadedFile(name + ".pdf", SAMPLE.read_bytes()), save=False)
        doc.rehash()
        doc.save()
        return doc

    def test_calibration_round_trip(self):
        doc = self._make_doc("Cal")
        body = json.dumps({"calib": {"cx": 82.5, "cy": 96.1, "s": 4.3e-05, "theta": 0.05},
                           "img_w": 2318, "img_h": 3000, "page": 1})
        response = self.client.put("/api/maps/%d/calibration" % doc.pk, body,
                                   content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        doc.refresh_from_db()
        self.assertAlmostEqual(doc.calib["s"], 4.3e-05)
        self.assertAlmostEqual(doc.calib["theta"], 0.05)
        self.assertEqual(doc.calib_img_w, 2318)
        self.assertIsNotNone(doc.calib_updated_at)

        listing = self.client.get("/api/maps/").json()["maps"][0]
        self.assertIsNotNone(listing["calib"])
        self.assertIsNotNone(listing["calib_at"])

    def test_calibration_validation(self):
        doc = MapDocument.objects.create(name="Bad cal", page=1)
        bad_bodies = [
            {"calib": {"cx": 1, "cy": 2, "s": 3}},                      # missing theta
            {"calib": {"cx": 1, "cy": 2, "s": 0, "theta": 0}},          # non-positive scale
            {"calib": "nope"},                                          # not an object
            {"nothing": True},
        ]
        for body in bad_bodies:
            response = self.client.put("/api/maps/%d/calibration" % doc.pk,
                                       json.dumps(body), content_type="application/json")
            self.assertEqual(response.status_code, 400, body)
        self.assertEqual(self.client.put("/api/maps/999/calibration", "{}",
                                         content_type="application/json").status_code, 404)

    @override_settings(HUNTMAP_TOKEN="s3cret")
    def test_token_protects_writes(self):
        upload = SimpleUploadedFile("t.pdf", SAMPLE.read_bytes(), content_type="application/pdf")
        self.assertEqual(self.client.post("/api/maps/", {"file": upload}).status_code, 403)

        upload = SimpleUploadedFile("t2.pdf", SAMPLE.read_bytes(), content_type="application/pdf")
        ok = self.client.post("/api/maps/", {"file": upload}, HTTP_X_HUNTMAP_TOKEN="s3cret")
        self.assertEqual(ok.status_code, 201)

        doc = MapDocument.objects.first()
        blocked = self.client.put("/api/maps/%d/calibration" % doc.pk,
                                  json.dumps({"calib": {"cx": 1, "cy": 2, "s": 3, "theta": 0}}),
                                  content_type="application/json")
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(self.client.get("/api/maps/").status_code, 200)   # reads stay open

    # ------------------------------------------------------------------- upload page
    def test_upload_page_needs_login(self):
        response = self.client.get("/upload/")
        self.assertEqual(response.status_code, 302)
        self.assertIn("/accounts/login/", response["Location"])

        self.client.force_login(self.staff)
        self.assertEqual(self.client.get("/upload/").status_code, 200)

    def test_upload_page_creates_a_map(self):
        self.client.force_login(self.staff)
        upload = SimpleUploadedFile("page.pdf", SAMPLE.read_bytes(), content_type="application/pdf")
        response = self.client.post("/upload/", {"name": "From the form", "page": 1, "file": upload})
        self.assertEqual(response.status_code, 302)
        doc = MapDocument.objects.get(name="From the form")
        self.assertEqual(doc.kind, "pdf")
        self.assertTrue(doc.sha256)

    # ---------------------------------------------------------------------- command
    def test_addmap_command_is_idempotent(self):
        call_command("addmap", str(SAMPLE), "--name", "CLI map", verbosity=0)
        self.assertEqual(MapDocument.objects.filter(name="CLI map").count(), 1)

        call_command("addmap", str(SAMPLE), "--name", "CLI map again", verbosity=0)
        self.assertEqual(MapDocument.objects.count(), 1)   # identical bytes are skipped

    def test_addmap_takes_a_place(self):
        call_command("addmap", str(SAMPLE), "--name", "Placed", "--state", "vermont",
                     "--county", "rutland", "--city", "killington", verbosity=0)
        doc = MapDocument.objects.get(name="Placed")
        self.assertEqual(doc.state, "Vermont")
        self.assertEqual(doc.county, "Rutland")
        self.assertEqual(doc.city, "Killington")
        self.assertEqual(doc.place, "Vermont \u00b7 Rutland \u00b7 Killington")

    # ----------------------------------------------------------------- place + edit
    def _doc(self, name, state="", county="", city="", owner=None):
        doc = MapDocument.objects.create(name=name, page=1, state=state,
                                         county=county, city=city, owner=owner)
        doc.file.save(name.replace(" ", "-") + ".pdf",
                      SimpleUploadedFile(name + ".pdf", SAMPLE.read_bytes()), save=False)
        doc.rehash()
        doc.save()
        return doc

    def test_library_filters_by_place_and_search(self):
        self._doc("Elm Ridge", "Vermont", "Rutland", "Killington")
        self._doc("Bear Swamp", "Vermont", "Windsor", "Stockbridge")
        self._doc("North Maine", "Maine", "Franklin", "Rangeley")

        def names(**params):
            payload = self.client.get("/api/maps/", params).json()
            return sorted(m["name"] for m in payload["maps"])

        self.assertEqual(len(names()), 3)
        self.assertEqual(names(state="Vermont"), ["Bear Swamp", "Elm Ridge"])
        self.assertEqual(names(state="vermont", county="Rutland"), ["Elm Ridge"])
        self.assertEqual(names(city="Rangeley"), ["North Maine"])
        self.assertEqual(names(q="elm"), ["Elm Ridge"])
        self.assertEqual(names(q="stockbridge"), ["Bear Swamp"])
        self.assertEqual(names(q="zzz"), [])

        payload = self.client.get("/api/maps/").json()
        self.assertIn("Vermont", payload["places"]["states"])
        self.assertEqual(payload["places"]["counties_by_state"]["Vermont"],
                         ["Rutland", "Windsor"])

    def test_map_metadata_can_be_edited_by_the_owner(self):
        user = get_user_model().objects.create_user("bob", password="bob-pass-123")
        doc = self._doc("Old name", owner=user)
        self.client.force_login(user)
        body = json.dumps({"name": "New name", "state": "vermont", "county": "rutland",
                           "city": "killington", "notes": "clearcut edge", "page": 3})
        response = self.client.patch("/api/maps/%d/" % doc.pk, body,
                                     content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        payload = response.json()
        self.assertEqual(payload["name"], "New name")
        self.assertEqual(payload["state"], "Vermont")        # capitalised
        self.assertEqual(payload["city"], "Killington")
        self.assertEqual(payload["page"], 3)
        self.assertEqual(payload["notes"], "clearcut edge")

    def test_metadata_edit_is_refused_for_other_accounts(self):
        owner = get_user_model().objects.create_user("owner", password="owner-pass-1")
        other = get_user_model().objects.create_user("other", password="other-pass-1")
        doc = self._doc("Private", owner=owner)
        self.client.force_login(other)
        response = self.client.patch("/api/maps/%d/" % doc.pk, json.dumps({"name": "hax"}),
                                     content_type="application/json")
        self.assertEqual(response.status_code, 403)
        doc.refresh_from_db()
        self.assertEqual(doc.name, "Private")

    # -------------------------------------------------------------------- accounts
    def test_register_signs_in_and_scopes_the_library(self):
        response = self.client.post("/api/register/",
                                    json.dumps({"username": "alice", "password": "alice-pass-1"}),
                                    content_type="application/json")
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["user"], "alice")

        upload = SimpleUploadedFile("mine.pdf", SAMPLE.read_bytes(), content_type="application/pdf")
        self.assertEqual(self.client.post("/api/maps/", {"file": upload, "name": "Mine"}).status_code, 201)
        self.assertEqual(MapDocument.objects.get(name="Mine").owner.username, "alice")

        # another account cannot see it; a map with no owner is shared
        bob = get_user_model().objects.create_user("bob", password="bob-pass-123")
        self._doc("Bobs map", owner=bob)
        self._doc("Shared map")
        names = sorted(m["name"] for m in self.client.get("/api/maps/").json()["maps"])
        self.assertEqual(names, ["Mine", "Shared map"])

    def test_login_logout_and_me(self):
        get_user_model().objects.create_user("carol", password="carol-pass-1")
        self.assertIsNone(self.client.get("/api/me/").json()["user"])

        bad = self.client.post("/api/login/", json.dumps({"username": "carol", "password": "nope"}),
                               content_type="application/json")
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(bad.json()["code"], "bad-credentials")

        ok = self.client.post("/api/login/", json.dumps({"username": "carol", "password": "carol-pass-1"}),
                              content_type="application/json")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(self.client.get("/api/me/").json()["user"], "carol")

        self.assertEqual(self.client.post("/api/logout/").status_code, 200)
        self.assertIsNone(self.client.get("/api/me/").json()["user"])

    def test_login_forgives_case_and_stray_spaces(self):
        get_user_model().objects.create_user("Caroline", password="carol-pass-1")
        # "CAROLINE" plus a trailing space (phone keyboards / autofill do this)
        response = self.client.post("/api/login/",
                                    json.dumps({"username": " CAROLINE ", "password": "carol-pass-1 "}),
                                    content_type="application/json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["user"], "Caroline")

    def test_login_with_no_accounts_explains_itself(self):
        get_user_model().objects.all().delete()      # a fresh server with no admin
        response = self.client.post("/api/login/",
                                    json.dumps({"username": "admin", "password": "whatever"}),
                                    content_type="application/json")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["code"], "no-accounts")
        self.assertIn("no accounts", response.json()["error"].lower())

    @override_settings(HUNTMAP_REQUIRE_AUTH=True)
    def test_require_auth_hides_the_library(self):
        doc = self._doc("Hidden")
        self.assertEqual(self.client.get("/api/maps/").json()["maps"], [])
        self.assertEqual(self.client.get("/api/maps/%d/file" % doc.pk).status_code, 404)

        user = get_user_model().objects.create_user("dave", password="dave-pass-1")
        self.client.force_login(user)
        names = [m["name"] for m in self.client.get("/api/maps/").json()["maps"]]
        self.assertEqual(names, ["Hidden"])     # shared map (no owner) is visible when signed in

    def test_library_page_renders_and_filters(self):
        self._doc("Elm Ridge", "Vermont", "Rutland", "Killington")
        self._doc("North Maine", "Maine", "Franklin", "Rangeley")
        page = self.client.get("/library/")
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, "Elm Ridge")
        self.assertContains(page, "North Maine")
        filtered = self.client.get("/library/", {"state": "Maine"})
        self.assertContains(filtered, "North Maine")
        self.assertNotContains(filtered, "Elm Ridge")

    def test_map_edit_page_updates_fields(self):
        self.client.force_login(self.staff)
        doc = self._doc("Rename me")
        self.assertEqual(self.client.get("/library/%d/edit/" % doc.pk).status_code, 200)
        response = self.client.post("/library/%d/edit/" % doc.pk, {
            "name": "Renamed", "page": 1, "state": "maine", "county": "franklin",
            "city": "rangeley", "notes": "north side",
        })
        self.assertEqual(response.status_code, 302)
        doc.refresh_from_db()
        self.assertEqual(doc.name, "Renamed")
        self.assertEqual(doc.state, "Maine")
        self.assertEqual(doc.place, "Maine \u00b7 Franklin \u00b7 Rangeley")

