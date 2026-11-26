from django import forms
from django.conf import settings
from pathlib import Path

from .models import ALLOWED_EXTS, MapDocument


class MapUploadForm(forms.ModelForm):
    class Meta:
        model = MapDocument
        fields = ["name", "file", "page", "state", "county", "city", "notes"]
        widgets = {
            "name": forms.TextInput(attrs={"placeholder": "e.g. Elm Ridge 1:24,000"}),
            "notes": forms.Textarea(attrs={"rows": 2, "placeholder": "Optional notes for this map"}),
            "page": forms.NumberInput(attrs={"min": 1, "style": "width:90px"}),
            "state": forms.TextInput(attrs={"placeholder": "Vermont", "list": "state-list"}),
            "county": forms.TextInput(attrs={"placeholder": "Rutland", "list": "county-list"}),
            "city": forms.TextInput(attrs={"placeholder": "Killington", "list": "city-list"}),
        }

    def clean_file(self):
        upload = self.cleaned_data["file"]
        ext = Path(upload.name).suffix.lower()
        if ext not in ALLOWED_EXTS:
            raise forms.ValidationError("Use a PDF, TIFF, PNG, JPEG or WebP file.")
        if upload.size > settings.HUNTMAP_MAX_UPLOAD:
            limit = settings.HUNTMAP_MAX_UPLOAD // (1024 * 1024)
            raise forms.ValidationError("That file is larger than %s MB." % limit)
        return upload

    def clean(self):
        cleaned = super().clean()
        if not cleaned.get("name") and cleaned.get("file"):
            cleaned["name"] = Path(cleaned["file"].name).stem[:190]
        # Normalise place names so filters do not end up with "vt", "VT", "Vermont".
        for field in ("state", "county", "city"):
            value = (cleaned.get(field) or "").strip()
            cleaned[field] = " ".join(word.capitalize() for word in value.split())
        return cleaned


class MapEditForm(forms.ModelForm):
    """Rename a map / fix its place, without touching the file."""

    class Meta:
        model = MapDocument
        fields = ["name", "page", "state", "county", "city", "notes"]
        widgets = {
            "name": forms.TextInput(attrs={"placeholder": "Map name"}),
            "page": forms.NumberInput(attrs={"min": 1, "style": "width:90px"}),
            "state": forms.TextInput(attrs={"placeholder": "Vermont"}),
            "county": forms.TextInput(attrs={"placeholder": "Rutland"}),
            "city": forms.TextInput(attrs={"placeholder": "Killington"}),
            "notes": forms.Textarea(attrs={"rows": 3}),
        }

    def clean(self):
        cleaned = super().clean()
        for field in ("state", "county", "city"):
            value = (cleaned.get(field) or "").strip()
            cleaned[field] = " ".join(word.capitalize() for word in value.split())
        return cleaned
