"""URL routing for the HuntMap server."""
from django.contrib import admin
from django.urls import include, path

from maps import views as map_views

urlpatterns = [
    path("api/", include("maps.urls")),
    path("upload/", map_views.upload_page, name="upload"),
    path("admin/", admin.site.urls),
    path("favicon.ico", map_views.favicon, name="favicon"),
    path("", map_views.app_file, name="app-root"),
    # Everything else is a file inside the HuntMap web app (css/js/vendor/icons).
    path("<path:path>", map_views.app_file, name="app-file"),
]
