from django.urls import path
from .views import (
    LoginView, RegisterView, LogoutView,
    CookieTokenObtainPairView, CookieTokenRefreshView,
    ChannelListView, PostListView, PostCreateView, ReplyCreateView,
    MeView, UserListView,
    UpdatePublicKeyView, GetPublicKeyView, ProfileUpdateView, ChangePasswordView
)

urlpatterns = [
    path('token/', CookieTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('login/', LoginView.as_view(), name='login'),
    path('register/', RegisterView.as_view(), name='register'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('channels/', ChannelListView.as_view(), name='channels'),
    path('channels/<slug:slug>/posts/', PostListView.as_view(), name='channel-posts'),
    path('posts/', PostCreateView.as_view(), name='post-create'),
    path('replies/', ReplyCreateView.as_view(), name='reply-create'),
    path('me/', MeView.as_view(), name='me'),
    path('users/', UserListView.as_view(), name='users'),
    path('update-public-key/', UpdatePublicKeyView.as_view()),
    path('public-key/<int:user_id>/', GetPublicKeyView.as_view()),
    path('profile/', ProfileUpdateView.as_view(), name='profile'),
    path('profile/change-password/', ChangePasswordView.as_view(), name='change-password'),
]
