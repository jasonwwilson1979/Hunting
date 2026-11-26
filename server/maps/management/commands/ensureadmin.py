"""Create or promote the admin user from environment variables (idempotent).

Used by the container entrypoint:
    HUNTMAP_ADMIN_USER=admin HUNTMAP_ADMIN_PASSWORD=secret
The password is only set when the user is created, so a password changed later
with `manage.py changepassword` survives restarts.
"""
import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Ensure the HUNTMAP_ADMIN_USER account exists as a staff superuser"

    def handle(self, *args, **options):
        username = (os.environ.get("HUNTMAP_ADMIN_USER") or "").strip() or "admin"
        password = os.environ.get("HUNTMAP_ADMIN_PASSWORD") or ""
        email = (os.environ.get("HUNTMAP_ADMIN_EMAIL") or "").strip()

        if not password:
            self.stdout.write("ensureadmin: HUNTMAP_ADMIN_PASSWORD not set, skipped")
            return

        User = get_user_model()
        user, created = User.objects.get_or_create(
            username=username,
            defaults={"email": email, "is_staff": True, "is_superuser": True},
        )
        changed = False
        if not user.is_staff:
            user.is_staff = True
            changed = True
        if not user.is_superuser:
            user.is_superuser = True
            changed = True
        if created:
            user.set_password(password)
            changed = True
        if email and not user.email:
            user.email = email
            changed = True
        if changed:
            user.save()
            self.stdout.write(self.style.SUCCESS(
                "ensureadmin: %s %s" % ("created" if created else "updated", username)))
        else:
            self.stdout.write("ensureadmin: %s already exists" % username)
