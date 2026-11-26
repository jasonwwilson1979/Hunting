"""URL routing for the HuntMap server."""
from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path

from maps import views as map_views

urlpatterns = [
    path("api/", include("maps.urls")),
    path("library/", map_views.library_page, name="library"),
    path("library/<int:pk>/edit/", map_views.map_edit, name="map-edit"),
    path("upload/", map_views.upload_page, name="upload"),
    path("accounts/login/", auth_views.LoginView.as_view(
        template_name="maps/login.html", redirect_authenticated_user=True), name="login"),
    path("accounts/logout/", auth_views.LogoutView.as_view(), name="logout"),
    path("accounts/register/", map_views.register, name="register"),
    path("admin/", admin.site.urls),
    path("favicon.ico", map_views.favicon, name="favicon"),
    path("", map_views.app_file, name="app-root"),
    # Everything else is a file inside the HuntMap web app (css/js/vendor/icons).
    path("<path:path>", map_views.app_file, name="app-file"),
]
