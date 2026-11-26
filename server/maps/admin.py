from django.contrib import admin

from .models import MapDocument


@admin.register(MapDocument)
class MapDocumentAdmin(admin.ModelAdmin):
    list_display = ("name", "place", "kind", "page", "size_mb", "georeferenced", "owner", "updated_at")
    list_filter = ("kind", "state", "county", "owner")
    search_fields = ("name", "notes", "sha256", "state", "county", "city")
    date_hierarchy = "updated_at"
    autocomplete_fields = ()
    readonly_fields = (
        "kind", "ext", "sha256", "size", "uploaded_at", "updated_at",
        "calib", "calib_img_w", "calib_img_h", "calib_page", "calib_updated_at",
    )
    fieldsets = (
        (None, {"fields": ("name", "file", "page", "notes")}),
        ("Place", {"fields": ("state", "county", "city")}),
        ("Sharing", {"fields": ("owner",),
                     "description": "Leave the owner empty to share this map with every account."}),
        ("Stored file", {
            "fields": ("kind", "ext", "size", "sha256", "uploaded_at", "updated_at"),
        }),
        ("Georeference (shared with phones)", {
            "classes": ("collapse",),
            "fields": ("calib", "calib_img_w", "calib_img_h", "calib_page", "calib_updated_at"),
        }),
    )

    @admin.display(boolean=True, description="Georeferenced")
    def georeferenced(self, obj):
        return bool(obj.calib)

    def save_model(self, request, obj, form, change):
        if obj.file and (not change or "file" in form.changed_data):
            obj.rehash()
        super().save_model(request, obj, form, change)
