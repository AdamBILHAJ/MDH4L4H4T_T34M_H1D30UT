from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # Private DM WebSocket - includes user_id for the other participant
    re_path(r'^ws/dm/(?P<user_id>\w+)/$', consumers.PrivateChatConsumer.as_asgi()),
    
    # Group chat WebSocket - all group members connect here
    re_path(r'^ws/group/$', consumers.GroupChatConsumer.as_asgi()),
    
    # Presence WebSocket - tracks online/offline status
    re_path(r"^ws/presence/$", consumers.PresenceConsumer.as_asgi()),
]