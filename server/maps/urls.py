from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.api_health, name="health"),
    path("maps/", views.api_maps, name="map-list"),
    path("maps/<int:pk>/", views.api_map_detail, name="map-detail"),
    path("maps/<int:pk>/file", views.api_map_file, name="map-file"),
    path("maps/<int:pk>/calibration", views.api_calibration, name="map-calibration"),
    path("me/", views.api_me, name="api-me"),
    path("diag/", views.api_diag, name="api-diag"),
    path("login/", views.api_login, name="api-login"),
    path("logout/", views.api_logout, name="api-logout"),
    path("register/", views.api_register, name="api-register"),
]
