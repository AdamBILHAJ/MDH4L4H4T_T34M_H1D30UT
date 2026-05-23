import json
import logging
from datetime import timedelta
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import AccessToken
from .models import Message, GroupMessage, GroupMessageKey, MessageReaction
from django.utils import timezone

logger = logging.getLogger(__name__)
User = get_user_model()


# ==================== PRESENCE HELPER FUNCTIONS ====================

@database_sync_to_async
def set_user_online(user_id, is_online):
    from api.models import UserPresence
    presence, created = UserPresence.objects.get_or_create(user_id=user_id)
    presence.is_online = is_online
    presence.last_seen = timezone.now()
    presence.save()
    return presence


@database_sync_to_async
def get_all_presence():
    from api.models import UserPresence
    presences = UserPresence.objects.select_related('user').all()
    return [
        {
            'id': p.user.id,
            'username': p.user.username,
            'display_name': p.user.display_name,
            'is_online': p.is_online,
            'last_seen': p.last_seen.isoformat() if p.last_seen else None
        }
        for p in presences
    ]


# ==================== PRIVATE CHAT CONSUMER ====================

class PrivateChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        token = self.scope['query_string'].decode().split('token=')[-1]
        self.user = await self.get_user_from_token(token)
        if self.user is None:
            await self.close()
            return

        other_user_id = self.scope['url_route']['kwargs']['user_id']
        ids = sorted([int(self.user.id), int(other_user_id)])
        self.room_group_name = f'dm_{ids[0]}_{ids[1]}'
        self.other_user_id = int(other_user_id)

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        await self.mark_user_online()

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        await self.mark_user_offline()

    async def receive(self, text_data):
        data = json.loads(text_data)
        message_type = data.get('type', 'message')

        if message_type == 'message':
            await self.handle_text_message(data)
        elif message_type == 'typing_start':
            await self.handle_typing_start()
        elif message_type == 'typing_stop':
            await self.handle_typing_stop()
        elif message_type == 'seen':
            await self.handle_seen(data)
        elif message_type == 'file':
            await self.handle_file_message(data)
        elif message_type == 'reaction':
            await self.handle_reaction(data)
        elif message_type == 'delete':
            await self.handle_delete(data)

    async def handle_text_message(self, data):
        content = data['message']
        sender_encrypted = data.get('sender_encrypted', '')
        reply_to_id = data.get('reply_to')

        message = await self.save_message(
            self.user.id,
            self.other_user_id,
            content,
            sender_encrypted,
            reply_to_id
        )

        # Look up the reply target's meta from DB so every recipient
        # (including echo-back to the sender) gets a full content block.
        reply_to_obj = None
        reply_meta = None
        if reply_to_id:
            try:
                # We are inside an async method; use sync-style lookup here
                # then convert via the helper.
                reply_to_obj = await database_sync_to_async(Message.objects.get)(id=reply_to_id)
            except Message.DoesNotExist:
                reply_to_obj = None

            if reply_to_obj:
                sender_user = await database_sync_to_async(
                    lambda: User.objects.values('id', 'username', 'display_name').get(id=reply_to_obj.sender_id)
                )()
                reply_meta = {
                    "reply_to_id":    reply_to_obj.id,
                    "reply_to_sender_id":    sender_user['id'],
                    "reply_to_sender_username": sender_user['username'],
                    "reply_to_sender_display_name": sender_user.get('display_name') or sender_user['username'],
                }

        # Build the optional reply block to include in the broadcast
        reply_block = {}
        if reply_meta:
            reply_block = reply_meta

        # Broadcast, include full reply meta so every recipient (including
        # the sender's own echo) can build the quoted-message banner from
        # authoritative source data instead of stale local state.
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "message_id": message.id,
                "message": content,
                "sender_encrypted": sender_encrypted,
                "sender_id": self.user.id,
                "sender_username": self.user.username,
                "sender_display_name": self.user.display_name or self.user.username,
                "timestamp": str(message.timestamp),
                "file_url": None,
                "file_name": None,
                "file_type": None,
                "reply_to": reply_meta["reply_to_id"] if reply_meta else reply_to_id,
                **reply_block,
            }
        )

    async def handle_file_message(self, data):
        message = await self.save_file_message(
            self.user.id,
            self.other_user_id,
            data.get('file_url'),
            data.get('file_name'),
            data.get('file_type'),
            data.get('file_path')
        )

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "message_id": message.id,
                "message": "",
                "sender_id": self.user.id,
                "sender_username": self.user.username,
                "sender_display_name": self.user.display_name or self.user.username,
                "timestamp": str(message.timestamp),
                "file_url": data.get('file_url'),
                "file_name": data.get('file_name'),
                "file_type": data.get('file_type'),
            }
        )

    async def handle_typing_start(self):
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "typing_event", "sender_id": self.user.id, "action": "start"}
        )

    async def handle_typing_stop(self):
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "typing_event", "sender_id": self.user.id, "action": "stop"}
        )

    async def handle_seen(self, data):
        message_id = data.get('message_id')
        if message_id:
            await self.mark_message_seen(message_id, self.user.id)
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "seen_update",
                    "message_id": message_id,
                    "user_id": self.user.id,
                    "username": self.user.username,
                    "display_name": self.user.display_name or self.user.username,
                }
            )

    async def handle_reaction(self, data):
        message_id = data.get('message_id')
        emoji = data.get('emoji')
        action = data.get('action', 'add')

        if action == 'add':
            await self.add_reaction(message_id, self.user.id, emoji)
        else:
            await self.remove_reaction(message_id, self.user.id, emoji)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "reaction_update",
                "message_id": message_id,
                "user_id": self.user.id,
                "username": self.user.username,
                "display_name": self.user.display_name or self.user.username,
                "emoji": emoji,
                "action": action,
            }
        )
    async def handle_delete(self, data):
        message_id = data.get('message_id')
        if not message_id:
            return
        # Check if user is sender (will be done in DB operation)
        deleted = await self.delete_message(message_id, self.user.id)
        if deleted:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                "type": "message_deleted",
                "message_id": message_id,
                "user_id": self.user.id,
                }
            )

    # ==================== EVENT HANDLERS ====================

    async def chat_message(self, event):
        is_sender = event["sender_id"] == self.user.id
        message_content = event.get("sender_encrypted", event["message"]) if is_sender else event["message"]

        await self.send(text_data=json.dumps({
            "message_id": event["message_id"],
            "message": message_content,
            "sender_id": event["sender_id"],
            "sender_username": event["sender_username"],
            "sender_display_name": event.get("sender_display_name", event["sender_username"]),
            "timestamp": event["timestamp"],
            "file_url": event.get("file_url"),
            "file_name": event.get("file_name"),
            "file_type": event.get("file_type"),
        }))

    async def typing_event(self, event):
        await self.send(text_data=json.dumps({
            "type": "typing_start" if event["action"] == "start" else "typing_stop",
            "sender_id": event["sender_id"],
        }))

    async def seen_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "seen",
            "message_id": event["message_id"],
            "user_id": event["user_id"],
            "username": event["username"],
            "display_name": event["display_name"],
        }))

    async def reaction_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "reaction",
            "message_id": event["message_id"],
            "user_id": event["user_id"],
            "username": event["username"],
            "display_name": event["display_name"],
            "emoji": event["emoji"],
            "action": event["action"],
        }))
    async def message_deleted(self, event):
        await self.send(text_data=json.dumps({
        "type": "delete",
        "message_id": event["message_id"],
        "user_id": event["user_id"],
    }))

    # ==================== DATABASE OPERATIONS ====================

    @database_sync_to_async
    def delete_message(self, message_id, user_id):
        try:
            message = Message.objects.get(id=message_id)
            if message.sender.id != user_id:
                return False
            message.delete()
            return True
        except Message.DoesNotExist:
            return False
    @database_sync_to_async
    def get_user_from_token(self, token):
        try:
            validated = AccessToken(token)
            return User.objects.get(id=validated['user_id'])
        except Exception as e:
            logger.error(f"Token validation failed: {e}")
            return None

    @database_sync_to_async
    def save_message(self, sender_id, receiver_id, content, sender_encrypted_content, reply_to_id=None):
        Message.objects.filter(expires_at__lt=timezone.now()).delete()
        sender = User.objects.get(id=sender_id)
        receiver = User.objects.get(id=receiver_id)

        reply_to = None
        if reply_to_id:
            try:
                reply_to = Message.objects.get(id=reply_to_id)
            except Message.DoesNotExist:
                pass

        message = Message.objects.create(
        sender=sender,
        receiver=receiver,
        content=content,
        sender_encrypted_content=sender_encrypted_content,
        expires_at=timezone.now() + timedelta(hours=48),
        reply_to=reply_to
    )
        logger.info(f"Message saved: {message.id} from {sender.username} to {receiver.username}")
        return message

    @database_sync_to_async
    def save_file_message(self, sender_id, receiver_id, file_url, file_name, file_type, file_path):
        Message.objects.filter(expires_at__lt=timezone.now()).delete()
        sender = User.objects.get(id=sender_id)
        receiver = User.objects.get(id=receiver_id)
        message = Message.objects.create(
            sender=sender,
            receiver=receiver,
            content="",
            file=file_path,
            file_name=file_name,
            file_type=file_type,
            expires_at=timezone.now() + timedelta(hours=48)
        )
        return message

    @database_sync_to_async
    def mark_message_seen(self, message_id, user_id):
        try:
            message = Message.objects.get(id=message_id)
            user = User.objects.get(id=user_id)
            message.seen_by.add(user)
            return True
        except (Message.DoesNotExist, User.DoesNotExist):
            return False

    @database_sync_to_async
    def add_reaction(self, message_id, user_id, emoji):
        try:
            message = Message.objects.get(id=message_id)
            user = User.objects.get(id=user_id)
            # Delete any existing reaction from this user on this message
            MessageReaction.objects.filter(message=message, user=user).delete()
            # Create the new reaction
            MessageReaction.objects.create(message=message, user=user, emoji=emoji)
            return True
        except Exception:
            return False

    @database_sync_to_async
    def remove_reaction(self, message_id, user_id, emoji):
        try:
            MessageReaction.objects.filter(message_id=message_id, user_id=user_id, emoji=emoji).delete()
            return True
        except Exception:
            return False

    @database_sync_to_async
    def mark_user_online(self):
        try:
            from api.models import UserPresence
            presence, _ = UserPresence.objects.get_or_create(user=self.user)
            presence.is_online = True
            presence.last_seen = timezone.now()
            presence.save()
        except Exception as e:
            logger.error(f"Failed to mark user online: {e}")

    @database_sync_to_async
    def mark_user_offline(self):
        try:
            from api.models import UserPresence
            UserPresence.objects.filter(user=self.user).update(is_online=False, last_seen=timezone.now())
        except Exception as e:
            logger.error(f"Failed to mark user offline: {e}")


# ==================== GROUP CHAT CONSUMER ====================

class GroupChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        token = self.scope['query_string'].decode().split('token=')[-1]
        self.user = await self.get_user_from_token(token)
        if self.user is None:
            await self.close()
            return

        self.room_group_name = 'group_global'
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()
        await self.mark_user_online()

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
        await self.mark_user_offline()

    async def receive(self, text_data):
        data = json.loads(text_data)
        message_type = data.get('type', 'message')

        if message_type == 'message':
            await self.handle_text_message(data)
        elif message_type == 'typing_start':
            await self.handle_typing_start()
        elif message_type == 'typing_stop':
            await self.handle_typing_stop()
        elif message_type == 'seen':
            await self.handle_seen(data)
        elif message_type == 'file':
            await self.handle_file_message(data)
        elif message_type == 'reaction':
            await self.handle_reaction(data)
        elif message_type == 'delete':
            await self.handle_delete(data)

    async def handle_text_message(self, data):
        content = data['message']
        encrypted_keys = data.get('encrypted_keys', {})
        reply_to_id = data.get('reply_to')

        message = await self.save_group_message(
        self.user.id,
        content,
        encrypted_keys,
        reply_to_id
    )

        await self.channel_layer.group_send(
        self.room_group_name,
        {
            "type": "chat_message",
            "message_id": message.id,
            "message": content,
            "sender_id": self.user.id,
            "sender_username": self.user.username,
            "sender_display_name": self.user.display_name or self.user.username,
            "timestamp": str(message.timestamp),
            "file_url": None,
            "file_name": None,
            "file_type": None,
            "reply_to": reply_to_id,
        }
    )
    async def handle_file_message(self, data):
        message = await self.save_group_file_message(
            self.user.id,
            data.get('file_url'),
            data.get('file_name'),
            data.get('file_type'),
            data.get('file_path')
        )

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "chat_message",
                "message_id": message.id,
                "message": "",
                "sender_id": self.user.id,
                "sender_username": self.user.username,
                "sender_display_name": self.user.display_name or self.user.username,
                "timestamp": str(message.timestamp),
                "file_url": data.get('file_url'),
                "file_name": data.get('file_name'),
                "file_type": data.get('file_type'),
            }
        )
    async def handle_delete(self, data):
        message_id = data.get('message_id')
        if not message_id:
            return
        # Check if user is sender (will be done in DB operation)
        deleted = await self.delete_message(message_id, self.user.id)
        if deleted:
            await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "message_deleted",
                "message_id": message_id,
                "user_id": self.user.id,
            }
        )

    async def handle_typing_start(self):
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "typing_event", "sender_id": self.user.id, "action": "start"}
        )

    async def handle_typing_stop(self):
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "typing_event", "sender_id": self.user.id, "action": "stop"}
        )

    async def handle_seen(self, data):
        message_id = data.get('message_id')
        if message_id:
            await self.mark_group_message_seen(message_id, self.user.id)
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "seen_update",
                    "message_id": message_id,
                    "user_id": self.user.id,
                    "username": self.user.username,
                    "display_name": self.user.display_name or self.user.username,
                }
            )
    async def message_deleted(self, event):
        await self.send(text_data=json.dumps({
        "type": "delete",
        "message_id": event["message_id"],
        "user_id": event["user_id"],
    }))
    async def handle_reaction(self, data):
        message_id = data.get('message_id')
        emoji = data.get('emoji')
        action = data.get('action', 'add')

        if action == 'add':
            await self.add_group_reaction(message_id, self.user.id, emoji)
        else:
            await self.remove_group_reaction(message_id, self.user.id, emoji)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "reaction_update",
                "message_id": message_id,
                "user_id": self.user.id,
                "username": self.user.username,
                "display_name": self.user.display_name or self.user.username,
                "emoji": emoji,
                "action": action,
            }
        )

    # ==================== EVENT HANDLERS ====================

    async def chat_message(self, event):
        await self.send(text_data=json.dumps({
            "message_id": event["message_id"],
            "message": event["message"],
            "sender_id": event["sender_id"],
            "sender_username": event["sender_username"],
            "sender_display_name": event.get("sender_display_name", event["sender_username"]),
            "timestamp": event["timestamp"],
            "file_url": event.get("file_url"),
            "file_name": event.get("file_name"),
            "file_type": event.get("file_type"),
        }))

    async def typing_event(self, event):
        await self.send(text_data=json.dumps({
            "type": "typing_start" if event["action"] == "start" else "typing_stop",
            "sender_id": event["sender_id"],
        }))

    async def seen_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "seen",
            "message_id": event["message_id"],
            "user_id": event["user_id"],
            "username": event["username"],
            "display_name": event["display_name"],
        }))

    async def reaction_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "reaction",
            "message_id": event["message_id"],
            "user_id": event["user_id"],
            "username": event["username"],
            "display_name": event["display_name"],
            "emoji": event["emoji"],
            "action": event["action"],
        }))

    # ==================== DATABASE OPERATIONS ====================
    @database_sync_to_async
    def delete_message(self, message_id, user_id):
        try:
            message = GroupMessage.objects.get(id=message_id)
            if message.sender.id != user_id:
                return False
            message.delete()
            return True
        except GroupMessage.DoesNotExist:
            return False
    @database_sync_to_async
    def get_user_from_token(self, token):
        try:
            validated = AccessToken(token)
            return User.objects.get(id=validated['user_id'])
        except Exception:
            return None

    @database_sync_to_async
    def save_group_message(self, sender_id, content, encrypted_keys, reply_to_id=None):
        # Clean up expired messages
        GroupMessage.objects.filter(expires_at__lt=timezone.now()).delete()
    
        # Get sender
        sender = User.objects.get(id=sender_id)
    
        # Handle reply_to if provided
        reply_to = None
        if reply_to_id:
            try:
                reply_to = GroupMessage.objects.get(id=reply_to_id)
                logger.info(f"Message will reply to: {reply_to_id}")
            except GroupMessage.DoesNotExist:
                logger.error(f"Reply-to message {reply_to_id} not found")
                # Optionally: raise an exception or just continue without reply
                pass
    
        # Create the group message
        message = GroupMessage.objects.create(
        sender=sender,
        content=content,
        expires_at=timezone.now() + timedelta(hours=48),
        reply_to=reply_to  # Add the reply relationship
    )
    
        # Save encrypted keys for each user in the group
        for user_id, encrypted_key in encrypted_keys.items():
            try:
                user = User.objects.get(id=user_id)
                GroupMessageKey.objects.create(
                message=message,
                user=user,
                encrypted_key=encrypted_key
            )
                logger.info(f"Saved key for user {user_id}")
            except User.DoesNotExist:
                logger.error(f"User {user_id} not found")
            except Exception as e:
                logger.error(f"Error saving key for user {user_id}: {e}")
    
        return message

    @database_sync_to_async
    def save_group_file_message(self, sender_id, file_url, file_name, file_type, file_path):
        GroupMessage.objects.filter(expires_at__lt=timezone.now()).delete()
        sender = User.objects.get(id=sender_id)
        message = GroupMessage.objects.create(
            sender=sender,
            content="",
            file=file_path,
            file_name=file_name,
            file_type=file_type,
            expires_at=timezone.now() + timedelta(hours=48)
        )
        return message

    @database_sync_to_async
    def mark_group_message_seen(self, message_id, user_id):
        try:
            message = GroupMessage.objects.get(id=message_id)
            user = User.objects.get(id=user_id)
            message.seen_by.add(user)
            return True
        except (GroupMessage.DoesNotExist, User.DoesNotExist):
            return False

    @database_sync_to_async
    def add_group_reaction(self, message_id, user_id, emoji):
        try:
            message = GroupMessage.objects.get(id=message_id)
            user = User.objects.get(id=user_id)
            MessageReaction.objects.filter(group_message=message, user=user).delete()
            MessageReaction.objects.create(group_message=message, user=user, emoji=emoji)
            return True
        except Exception:
            return False

    @database_sync_to_async
    def remove_group_reaction(self, message_id, user_id, emoji):
        try:
            MessageReaction.objects.filter(group_message_id=message_id, user_id=user_id, emoji=emoji).delete()
            return True
        except Exception:
            return False

    @database_sync_to_async
    def mark_user_online(self):
        try:
            from api.models import UserPresence
            presence, _ = UserPresence.objects.get_or_create(user=self.user)
            presence.is_online = True
            presence.last_seen = timezone.now()
            presence.save()
        except Exception as e:
            logger.error(f"Failed to mark user online: {e}")

    @database_sync_to_async
    def mark_user_offline(self):
        try:
            from api.models import UserPresence
            UserPresence.objects.filter(user=self.user).update(is_online=False, last_seen=timezone.now())
        except Exception as e:
            logger.error(f"Failed to mark user offline: {e}")


# ==================== PRESENCE CONSUMER ====================

class PresenceConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        token = self.scope['query_string'].decode().split('token=')[-1]
        self.user = await self.get_user_from_token(token)
        if self.user is None:
            await self.close()
            return

        self.group = "presence"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

        await set_user_online(self.user.id, True)
        await self.channel_layer.group_send(
            self.group,
            {"type": "presence_update", "user_id": self.user.id, "status": "online"}
        )

        all_presence = await get_all_presence()
        await self.send(text_data=json.dumps({"type": "presence_bulk", "users": all_presence}))
        await self.send_unread_counts()

    async def disconnect(self, code):
        if hasattr(self, 'user') and self.user:
            await set_user_online(self.user.id, False)
            await self.channel_layer.group_send(
                self.group,
                {"type": "presence_update", "user_id": self.user.id, "status": "offline"}
            )
        await self.channel_layer.group_discard(self.group, self.channel_name)

    async def presence_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "presence",
            "user_id": event["user_id"],
            "status": event["status"]
        }))

    async def send_unread_counts(self):
        unread = await self.get_unread_counts(self.user.id)
        for user_id, count in unread.items():
            await self.send(text_data=json.dumps({
                "type": "unread_update",
                "from_user_id": user_id,
                "count": count
            }))

    @database_sync_to_async
    def get_user_from_token(self, token):
        try:
            validated = AccessToken(token)
            return User.objects.get(id=validated['user_id'])
        except Exception:
            return None

    @database_sync_to_async
    def get_unread_counts(self, user_id):
        user = User.objects.get(id=user_id)
        unread_messages = Message.objects.filter(
            receiver=user,
            expires_at__gt=timezone.now()
        ).exclude(seen_by=user)

        from collections import defaultdict
        counts = defaultdict(int)
        for msg in unread_messages:
            counts[msg.sender.id] += 1
        return dict(counts)