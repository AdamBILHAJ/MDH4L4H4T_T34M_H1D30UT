from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
import os

class Message(models.Model):
    """
    Model for private direct messages between two users.
    Supports encrypted messages, file sharing, and read receipts.
    """
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='sent_messages',
        on_delete=models.CASCADE
    )
    receiver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='received_messages',
        on_delete=models.CASCADE
    )
    content = models.TextField()  # Encrypted for receiver
    sender_encrypted_content = models.TextField(null=True, blank=True)  # Encrypted for sender
    timestamp = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    
    # --- File Sharing Fields ---
    # Stores the actual file (images, documents, etc.) uploaded by user
    file = models.FileField(upload_to='chat_files/', null=True, blank=True)
    # Original filename to display to users
    file_name = models.CharField(max_length=255, null=True, blank=True)
    # MIME type (e.g., 'image/jpeg', 'application/pdf') for proper rendering
    file_type = models.CharField(max_length=100, null=True, blank=True)
    # File size in bytes to enforce 100MB limit
    file_size = models.PositiveIntegerField(null=True, blank=True)
    
    # --- Read Receipts (Messenger-style seen indicators) ---
    # Many-to-many relationship to track which users have seen this message
    # For DMs, only the receiver will be added when they open the conversation
    seen_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='seen_messages',
        blank=True
    )
    reply_to = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replies'
    )
    
    class Meta:
        ordering = ['timestamp']  # Messages sorted chronologically

    def save(self, *args, **kwargs):
        """Auto-set expiration to 48 hours from creation if not specified"""
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(hours=48)
        super().save(*args, **kwargs)
        
    def get_file_url(self):
        """Helper method to get the file URL safely"""
        if self.file:
            return self.file.url
        return None


class GroupMessage(models.Model):
    """
    Model for group chat messages.
    Similar to Message but uses AES encryption with per-user keys.
    """
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='group_messages',
        on_delete=models.CASCADE
    )
    content = models.TextField()  # AES-encrypted message
    timestamp = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    
    # File sharing fields (same as Message)
    file = models.FileField(upload_to='chat_files/', null=True, blank=True)
    file_name = models.CharField(max_length=255, null=True, blank=True)
    file_type = models.CharField(max_length=100, null=True, blank=True)
    file_size = models.PositiveIntegerField(null=True, blank=True)
    
    # Read receipts tracking (users who have seen this group message)
    seen_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name='seen_group_messages',
        blank=True
    )
    reply_to = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='replies'
    )
    class Meta:
        ordering = ['timestamp']

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(hours=48)
        super().save(*args, **kwargs)
        
    def get_file_url(self):
        if self.file:
            return self.file.url
        return None


class GroupMessageKey(models.Model):
    """
    Stores per-user AES keys for group messages.
    Each group message has a unique AES key, encrypted separately for each user
    using their RSA public key.
    """
    message = models.ForeignKey(
        GroupMessage,
        related_name='keys',
        on_delete=models.CASCADE
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='group_message_keys',
        on_delete=models.CASCADE
    )
    encrypted_key = models.TextField()  # AES key encrypted with user's RSA public key

    class Meta:
        unique_together = ('message', 'user')  # One key per user per message

    def __str__(self):
        return f"Key for {self.user} on message {self.message.id}"


class MessageReaction(models.Model):
    """
    Model for emoji reactions on messages.
    Supports both DM and group messages via nullable foreign keys.
    """
    # For DM reactions (one of these will be null, the other populated)
    message = models.ForeignKey(
        Message, 
        on_delete=models.CASCADE, 
        related_name='reactions', 
        null=True, 
        blank=True
    )
    group_message = models.ForeignKey(
        GroupMessage, 
        on_delete=models.CASCADE, 
        related_name='reactions', 
        null=True, 
        blank=True
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='reactions'
    )
    emoji = models.CharField(max_length=10)  # Single emoji character (e.g., '👍')
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        # Prevent duplicate reactions: one user can react once per message per emoji
        # This ensures a user can't add the same reaction multiple times
        unique_together = ('message', 'group_message', 'user', 'emoji')
        
    def __str__(self):
        target = f"message {self.message_id}" if self.message else f"group message {self.group_message_id}"
        return f"{self.user.username} reacted {self.emoji} to {target}"


class TypingStatus(models.Model):
    """
    Optional model to persist typing status.
    Note: We'll primarily handle typing via WebSocket in-memory,
    but this can be used for persistence if needed.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE,
        related_name='typing_statuses'
    )
    # For DM typing indicators - which user they're typing to
    chat_with = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='typing_to_me',
        null=True, 
        blank=True
    )
    is_group = models.BooleanField(default=False)  # True if typing in group chat
    updated_at = models.DateTimeField(auto_now=True)  # Last typing activity
    
    class Meta:
        # One typing status per user per conversation type
        unique_together = ('user', 'chat_with', 'is_group')