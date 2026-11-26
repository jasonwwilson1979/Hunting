from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.api_health, name="health"),
    path("maps/", views.api_maps, name="map-list"),
    path("maps/<int:pk>/", views.api_map_detail, name="map-detail"),
    path("maps/<int:pk>/file", views.api_map_file, name="map-file"),
    path("maps/<int:pk>/calibration", views.api_calibration, name="map-calibration"),
]
