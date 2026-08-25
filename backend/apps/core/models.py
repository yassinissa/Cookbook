"""
NOTE — Core Base Model
Mirrors apps.core.BaseModel in the inventory-platform repo so the two
codebases stay easy to read side by side. Every Cookbook model inherits
from this.
"""
import uuid
from django.db import models


class BaseModel(models.Model):
    """UUID primary key, timestamps, soft-delete flag — inherited by every model."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        abstract = True
        ordering = ['-created_at']
