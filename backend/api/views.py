from rest_framework import views, generics, status, permissions
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.conf import settings

User = get_user_model()


class CookieTokenObtainPairView(TokenObtainPairView):
    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        if response.status_code == status.HTTP_200_OK:
            refresh_token = response.data.get('refresh')
            access_token = response.data.get('access')
            response.set_cookie(
                key='refresh_token',
                value=refresh_token,
                httponly=True,
                secure=False,
                samesite='Lax',
                max_age=30 * 24 * 60 * 60,
            )
            response.data.pop('refresh', None)
        return response


class CookieTokenRefreshView(TokenRefreshView):
    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get('refresh_token')
        if not refresh_token:
            return Response({"detail": "Refresh token missing"}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = self.get_serializer(data={'refresh': refresh_token})
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as e:
            raise InvalidToken(e.args[0])
        access_token = serializer.validated_data.get('access')
        response = Response({"access": access_token}, status=status.HTTP_200_OK)
        new_refresh_token = serializer.validated_data.get('refresh')
        if new_refresh_token:
            response.set_cookie(
                key='refresh_token',
                value=new_refresh_token,
                httponly=True,
                secure=False,
                samesite='Lax',
                max_age=30 * 24 * 60 * 60,
            )
        return response


class LogoutView(views.APIView):
    def post(self, request):
        response = Response({"detail": "Logged out"})
        response.delete_cookie('refresh_token')
        return response


class LoginView(views.APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        if not username or not password:
            return Response({'error': 'Username and password are required'}, status=status.HTTP_400_BAD_REQUEST)
        user = authenticate(username=username, password=password)
        if not user:
            return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)
        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)
        response = Response({
            'access': access,
            'user': {
                'id': user.id,
                'username': user.username,
                'display_name': user.display_name,
                'bio': user.bio,
                'is_admin': user.is_admin,
                'avatar_url': request.build_absolute_uri(user.avatar.url) if user.avatar else None,
                'public_key': user.public_key,
            }
        })
        response.set_cookie(
            key='refresh_token',
            value=str(refresh),
            httponly=True,
            secure=False,
            samesite='Lax',
            max_age=30 * 24 * 60 * 60,
        )
        return response


class RegisterView(views.APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = request.data.get('username')
        password = request.data.get('password')
        if not username or not password:
            return Response({'error': 'Username and password are required'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({'error': 'Username already exists'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(password)
        except ValidationError as e:
            return Response({'error': ' '.join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)
        user = User.objects.create_user(username=username, password=password)
        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)
        response = Response({
            'access': access,
            'user': {
                'id': user.id,
                'username': user.username,
                'display_name': user.display_name,
                'bio': user.bio,
                'is_admin': user.is_admin,
                'avatar_url': request.build_absolute_uri(user.avatar.url) if user.avatar else None,
                'public_key': user.public_key,
            }
        })
        response.set_cookie(
            key='refresh_token',
            value=str(refresh),
            httponly=True,
            secure=False,
            samesite='Lax',
            max_age=30 * 24 * 60 * 60,
        )
        return response


class MeView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        return Response({
            'id': user.id,
            'username': user.username,
            'display_name': user.display_name,
            'bio': user.bio,
            'is_admin': user.is_admin,
            'avatar_url': request.build_absolute_uri(user.avatar.url) if user.avatar else None,
            'public_key': user.public_key,
        })


class UserListView(generics.ListAPIView):
    serializer_class = None
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return User.objects.all()

    def list(self, request):
        users = self.get_queryset()
        data = [{
            'id': u.id,
            'username': u.username,
            'display_name': u.display_name,
            'bio': u.bio,
            'is_admin': u.is_admin,
            'avatar_url': request.build_absolute_uri(u.avatar.url) if u.avatar else None,
            'public_key': u.public_key,
        } for u in users]
        return Response(data)


class UpdatePublicKeyView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        public_key = request.data.get('public_key')
        if not public_key:
            return Response({'error': 'Public key is required'}, status=status.HTTP_400_BAD_REQUEST)
        request.user.public_key = public_key
        request.user.save()
        return Response({'status': 'success'})


class GetPublicKeyView(views.APIView):
    permission_classes = [AllowAny]

    def get(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
            return Response({'public_key': user.public_key})
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)


class ProfileUpdateView(views.APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request):
        user = request.user
        user.display_name = request.data.get('display_name', user.display_name)
        user.bio = request.data.get('bio', user.bio)
        user.username = request.data.get('username', user.username)
        if 'avatar' in request.FILES:
            user.avatar = request.FILES['avatar']
        user.save()
        return Response({
            'id': user.id,
            'username': user.username,
            'display_name': user.display_name,
            'bio': user.bio,
            'is_admin': user.is_admin,
            'avatar_url': request.build_absolute_uri(user.avatar.url) if user.avatar else None,
            'public_key': user.public_key,
        })


class ChangePasswordView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        old_password = request.data.get('old_password')
        new_password = request.data.get('new_password')
        if not old_password or not new_password:
            return Response({'error': 'Old and new passwords are required'}, status=status.HTTP_400_BAD_REQUEST)
        if not request.user.check_password(old_password):
            return Response({'error': 'Old password is incorrect'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            validate_password(new_password)
        except ValidationError as e:
            return Response({'error': ' '.join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(new_password)
        request.user.save()
        refresh = RefreshToken.for_user(request.user)
        access = str(refresh.access_token)
        response = Response({'access': access})
        response.set_cookie(
            key='refresh_token',
            value=str(refresh),
            httponly=True,
            secure=False,
            samesite='Lax',
            max_age=30 * 24 * 60 * 60,
        )
        return response


class ChannelListView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        channels = [
            {'id': 1, 'name': 'General', 'slug': 'general'},
            {'id': 2, 'name': 'Crypto', 'slug': 'crypto'},
            {'id': 3, 'name': 'Web Exp', 'slug': 'web_exp'},
            {'id': 4, 'name': 'Forensics', 'slug': 'forensics'},
            {'id': 5, 'name': 'Reverse', 'slug': 'reverse'},
            {'id': 6, 'name': 'Pwn', 'slug': 'pwn'},
            {'id': 7, 'name': 'Mobile', 'slug': 'mobile'},
            {'id': 8, 'name': 'Linux', 'slug': 'linux'},
            {'id': 9, 'name': 'Networking', 'slug': 'networking'},
            {'id': 10, 'name': 'Web Dev', 'slug': 'web_dev'},
            {'id': 11, 'name': 'Threat Intel', 'slug': 'threat_intel'},
        ]
        return Response(channels)


class PostListView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, slug):
        return Response([])


class PostCreateView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({'status': 'created'}, status=status.HTTP_201_CREATED)


class ReplyCreateView(views.APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({'status': 'created'}, status=status.HTTP_201_CREATED)
