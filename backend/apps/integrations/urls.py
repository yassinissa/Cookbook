from django.urls import path
from . import views

urlpatterns = [
    path('items/', views.items, name='inventory-items'),
    path('items/<uuid:item_id>/', views.item_detail, name='inventory-item-detail'),
    path('stores/', views.stores, name='inventory-stores'),
    path('prep-kitchens/', views.prep_kitchens, name='inventory-prep-kitchens'),
    path('units/', views.units, name='inventory-units'),
]
