from django.urls import path
from .views import (
    MessageHistoryView,
    MarkMessagesSeenView,
    GroupMessageHistoryView,
    GroupMessageKeyView,
    MarkGroupMessageSeenView,
    MessageReactionView,
    upload_chat_file,
    UnreadCountsView,
    ChatPreviewsView,
    DeleteMessageView,
    DeleteGroupMessageView,
)

urlpatterns = [
    # Private chat
    path('history/<int:user_id>/', MessageHistoryView.as_view(), name='chat_history'),
    path('seen/<int:user_id>/', MarkMessagesSeenView.as_view(), name='mark_seen'),

    # Group chat
    path('group/history/', GroupMessageHistoryView.as_view(), name='group_history'),
    path('group/key/<int:message_id>/', GroupMessageKeyView.as_view(), name='group_key'),
    path('group/seen/<int:message_id>/', MarkGroupMessageSeenView.as_view(), name='group_seen'),

    # Reactions
    path('messages/<int:message_id>/react/', MessageReactionView.as_view(), name='message_reaction'),
    path('messages/<int:message_id>/reactions/', MessageReactionView.as_view(), name='get_reactions'),

    # File upload
    path('upload/', upload_chat_file, name='upload_file'),

    # Utilities
    path('unread/', UnreadCountsView.as_view(), name='unread_counts'),
    path('previews/', ChatPreviewsView.as_view(), name='chat_previews'),
     path('messages/<int:message_id>/', DeleteMessageView.as_view(), name='delete_message'),
    path('group/messages/<int:message_id>/', DeleteGroupMessageView.as_view(), name='delete_group_message'),
]