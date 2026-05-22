import datetime
import os
import uuid
import logging
import traceback
from collections import defaultdict

from rest_framework import views, generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.db import models as django_models
from django.conf import settings
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile

from .models import Message, GroupMessage, GroupMessageKey, MessageReaction
from .serializers import (
    MessageSerializer, GroupMessageSerializer,
    GroupMessageKeySerializer, MessageReactionSerializer
)

logger = logging.getLogger(__name__)
User = get_user_model()


# ==================== PRIVATE MESSAGE VIEWS ====================

class MessageHistoryView(generics.ListAPIView):
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        other_user_id = self.kwargs['user_id']
        user = self.request.user
        Message.objects.filter(expires_at__lt=timezone.now()).delete()
        return Message.objects.filter(
            django_models.Q(sender=user, receiver_id=other_user_id) |
            django_models.Q(sender_id=other_user_id, receiver=user)
        ).order_by('timestamp')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class MarkMessagesSeenView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        current_user = request.user
        unread_messages = Message.objects.filter(
            sender_id=user_id,
            receiver=current_user
        ).exclude(seen_by=current_user)

        count = 0
        for message in unread_messages:
            message.seen_by.add(current_user)
            count += 1

        return Response({'status': 'success', 'marked_count': count}, status=status.HTTP_200_OK)


# ==================== GROUP MESSAGE VIEWS ====================

class GroupMessageHistoryView(generics.ListAPIView):
    serializer_class = GroupMessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        GroupMessage.objects.filter(expires_at__lt=timezone.now()).delete()
        return GroupMessage.objects.all().order_by('timestamp')

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context


class GroupMessageKeyView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, message_id):
        key = get_object_or_404(GroupMessageKey, message_id=message_id, user=request.user)
        return Response({"encrypted_key": key.encrypted_key}, status=status.HTTP_200_OK)


class MarkGroupMessageSeenView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, message_id):
        try:
            message = GroupMessage.objects.get(id=message_id)
            message.seen_by.add(request.user)
            return Response({'status': 'success'}, status=status.HTTP_200_OK)
        except GroupMessage.DoesNotExist:
            return Response({'error': 'Message not found'}, status=status.HTTP_404_NOT_FOUND)


# ==================== REACTION VIEWS ====================

class MessageReactionView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, message_id):
        emoji = request.data.get('emoji')
        action = request.data.get('action', 'add')

        if not emoji:
            return Response({'error': 'Emoji is required'}, status=status.HTTP_400_BAD_REQUEST)
        if len(emoji) > 10:
            return Response({'error': 'Invalid emoji'}, status=status.HTTP_400_BAD_REQUEST)

        message = None
        is_group = False
        try:
            message = Message.objects.get(id=message_id)
            is_group = False
        except Message.DoesNotExist:
            try:
                message = GroupMessage.objects.get(id=message_id)
                is_group = True
            except GroupMessage.DoesNotExist:
                return Response({'error': 'Message not found'}, status=status.HTTP_404_NOT_FOUND)

        if action == 'add':
            # Remove any existing reaction from this user on this message
            MessageReaction.objects.filter(
            message=message if not is_group else None,
            group_message=message if is_group else None,
            user=request.user
            ).delete()
            # Create the new reaction
            reaction, created = MessageReaction.objects.get_or_create(
            message=message if not is_group else None,
            group_message=message if is_group else None,
            user=request.user,
            emoji=emoji
            )
            reaction_data = self._get_reaction_data(message, is_group, request.user)
            return Response({
            'action': 'add',
            'emoji': emoji,
            'created': created,
            'reactions': reaction_data
            }, status=200)

        elif action == 'remove':
            # Remove only the specific emoji (if user reacted with it)
            deleted = MessageReaction.objects.filter(
            message=message if not is_group else None,
            group_message=message if is_group else None,
            user=request.user,
            emoji=emoji
            ).delete()
            reaction_data = self._get_reaction_data(message, is_group, request.user)
            return Response({
            'action': 'remove',
            'emoji': emoji,
            'deleted': deleted[0] > 0,
            'reactions': reaction_data
            }, status=200)

        return Response({'error': 'Invalid action. Use "add" or "remove"'}, status=status.HTTP_400_BAD_REQUEST)
    def get(self, request, message_id):
        try:
            message = Message.objects.get(id=message_id)
            is_group = False
        except Message.DoesNotExist:
            try:
                message = GroupMessage.objects.get(id=message_id)
                is_group = True
            except GroupMessage.DoesNotExist:
                return Response({'error': 'Message not found'}, status=status.HTTP_404_NOT_FOUND)

        reaction_data = self._get_reaction_data(message, is_group, request.user)
        return Response(reaction_data, status=status.HTTP_200_OK)

    def _get_reaction_data(self, message, is_group, current_user):
        reactions = message.reactions.all()
        reaction_data = {}
        for reaction in reactions:
            emoji = reaction.emoji
            if emoji not in reaction_data:
                reaction_data[emoji] = {'count': 0, 'users': [], 'reacted': False}
            reaction_data[emoji]['count'] += 1
            reaction_data[emoji]['users'].append({
                'id': reaction.user.id,
                'username': reaction.user.username,
                'display_name': reaction.user.display_name or reaction.user.username,
                'avatar_url': self.request.build_absolute_uri(reaction.user.avatar.url) if reaction.user.avatar else None
            })
            if reaction.user.id == current_user.id:
                reaction_data[emoji]['reacted'] = True
        return reaction_data


# ==================== FILE UPLOAD VIEW ====================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_chat_file(request):
    try:
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

        max_size = getattr(settings, 'FILE_UPLOAD_MAX_MEMORY_SIZE', 100 * 1024 * 1024)
        if file.size > max_size:
            return Response({'error': f'File exceeds {max_size // (1024*1024)} MB limit'}, status=status.HTTP_400_BAD_REQUEST)

        media_root = settings.MEDIA_ROOT
        chat_files_dir = os.path.join(media_root, 'chat_files')
        os.makedirs(chat_files_dir, exist_ok=True)

        file_extension = os.path.splitext(file.name)[1]
        unique_filename = f"{uuid.uuid4().hex}{file_extension}"
        file_path = f"chat_files/{unique_filename}"
        saved_path = default_storage.save(file_path, ContentFile(file.read()))
        file_url = request.build_absolute_uri(default_storage.url(saved_path))

        receiver_id = request.data.get('receiver_id')
        is_group = request.data.get('group', 'false').lower() == 'true'

        if not is_group and receiver_id:
            try:
                User.objects.get(id=receiver_id)
            except User.DoesNotExist:
                default_storage.delete(saved_path)
                return Response({'error': 'Receiver not found'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'file_url': file_url,
            'file_name': file.name,
            'file_type': file.content_type,
            'file_size': file.size,
            'message_id': None,
            'is_group': is_group,
            'receiver_id': receiver_id if not is_group else None,
            'file_path': saved_path,
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"File upload error: {traceback.format_exc()}")
        return Response({'error': f'Upload failed: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# ==================== UNREAD COUNTS VIEW ====================

class UnreadCountsView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        current_user = request.user
        unread_messages = Message.objects.filter(
            receiver=current_user,
            expires_at__gt=timezone.now()
        ).exclude(seen_by=current_user)

        counts = defaultdict(int)
        for msg in unread_messages:
            counts[msg.sender.id] += 1

        result = []
        for user_id, count in counts.items():
            try:
                user = User.objects.get(id=user_id)
                result.append({
                    'user_id': user_id,
                    'username': user.username,
                    'display_name': user.display_name or user.username,
                    'avatar_url': self.request.build_absolute_uri(user.avatar.url) if user.avatar else None,
                    'unread_count': count
                })
            except User.DoesNotExist:
                continue
        return Response(result, status=status.HTTP_200_OK)


# ==================== CHAT PREVIEWS VIEW ====================

class ChatPreviewsView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        current_user = request.user
        sent_users = Message.objects.filter(sender=current_user).values_list('receiver_id', flat=True)
        received_users = Message.objects.filter(receiver=current_user).values_list('sender_id', flat=True)
        all_user_ids = set(list(sent_users) + list(received_users))
        users = User.objects.filter(id__in=all_user_ids)

        unread_counts = {}
        unread_messages = Message.objects.filter(receiver=current_user).exclude(seen_by=current_user)
        for msg in unread_messages:
            unread_counts[msg.sender_id] = unread_counts.get(msg.sender_id, 0) + 1

        result = []
        for user in users:
            last_message = Message.objects.filter(
                django_models.Q(sender=current_user, receiver=user) |
                django_models.Q(sender=user, receiver=current_user)
            ).order_by('-timestamp').first()

            result.append({
                'user_id': user.id,
                'username': user.username,
                'display_name': user.display_name or user.username,
                'avatar_url': self.request.build_absolute_uri(user.avatar.url) if user.avatar else None,
                'last_message': last_message.content if last_message else None,
                'last_message_time': last_message.timestamp if last_message else None,
                'unread_count': unread_counts.get(user.id, 0),
                'is_online': getattr(getattr(user, 'presence', None), 'is_online', False)
            })

        default_time = timezone.make_aware(datetime.datetime.min)
        result.sort(key=lambda x: x['last_message_time'] or default_time, reverse=True)
        return Response(result, status=status.HTTP_200_OK)
class DeleteMessageView(views.APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, message_id):
        try:
            message = Message.objects.get(id=message_id)
            if message.sender != request.user:
                return Response({'error': 'Not your message'}, status=403)
            message.delete()
            return Response({'status': 'deleted'}, status=204)
        except Message.DoesNotExist:
            return Response({'error': 'Message not found'}, status=404)
class DeleteGroupMessageView(views.APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, message_id):
        try:
            message = GroupMessage.objects.get(id=message_id)
            if message.sender != request.user:
                return Response({'error': 'Not your message'}, status=status.HTTP_403_FORBIDDEN)
            message.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except GroupMessage.DoesNotExist:
            return Response({'error': 'Message not found'}, status=status.HTTP_404_NOT_FOUND)
