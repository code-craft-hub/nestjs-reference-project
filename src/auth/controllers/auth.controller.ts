
import {
  Controller,
  Post,
  Body,
  Get,
  Patch,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { AuthService } from '../services/auth.service';
import { TwoFactorService } from '../services/two-factor.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  Enable2FADto,
} from '../dto';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Roles } from '../decorators/roles.decorator';
import { Permissions } from '../decorators/permissions.decorator';
import { LocalAuthGuard } from '../guards/local-auth.guard';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private twoFactorService: TwoFactorService,
  ) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle(5, 3600) // 5 requests per hour
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    schema: {
      example: {
        success: true,
        data: {
          user: {
            id: 'uuid',
            email: 'user@example.com',
            username: 'johndoe',
          },
          tokens: {
            accessToken: 'jwt-token',
            refreshToken: 'refresh-token',
            expiresIn: '15m',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle(10, 900) // 10 requests per 15 minutes
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refreshToken);
    return { message: 'Logged out successfully' };
  }

  @Get('profile')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser() user: any) {
    return this.authService.validateUser(user.userId);
  }

  @Patch('change-password')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Change password' })
  @ApiResponse({ status: 200, description: 'Password changed' })
  @ApiResponse({ status: 401, description: 'Invalid current password' })
  async changePassword(
    @CurrentUser('userId') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(userId, dto);
    return { message: 'Password changed successfully' };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle(3, 3600)
  @ApiOperation({ summary: 'Request password reset' })
  @ApiResponse({ status: 200, description: 'Reset email sent' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return { message: 'If email exists, reset link has been sent' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Password reset successfully' };
  }

  // 2FA Endpoints
  @Post('2fa/generate')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Generate 2FA secret and QR code' })
  @ApiResponse({
    status: 200,
    description: '2FA secret generated',
    schema: {
      example: {
        secret: 'BASE32SECRET',
        qrCode: 'data:image/png;base64,...',
      },
    },
  })
  async generate2FA(@CurrentUser('userId') userId: string) {
    return this.twoFactorService.generateSecret(userId);
  }

  @Post('2fa/enable')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Enable 2FA' })
  @ApiResponse({
    status: 200,
    description: '2FA enabled',
    schema: {
      example: {
        recoveryCodes: ['code1', 'code2', '...'],
      },
    },
  })
  async enable2FA(
    @CurrentUser('userId') userId: string,
    @Body() dto: Enable2FADto,
  ) {
    const recoveryCodes = await this.twoFactorService.enableTwoFactor(
      userId,
      dto.token,
    );
    return { recoveryCodes };
  }

  @Post('2fa/disable')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Disable 2FA' })
  async disable2FA(
    @CurrentUser('userId') userId: string,
    @Body() dto: Enable2FADto,
  ) {
    await this.twoFactorService.disableTwoFactor(userId, dto.token);
    return { message: '2FA disabled successfully' };
  }

  @Post('2fa/verify')
  @Public()
  @ApiOperation({ summary: 'Verify 2FA token during login' })
  async verify2FA(@Body() dto: { userId: string; token: string }) {
    const isValid = await this.twoFactorService.verifyToken(
      dto.userId,
      dto.token,
    );
    return { valid: isValid };
  }

  // OAuth Endpoints
  @Public()
  @Get('google')
  @ApiOperation({ summary: 'Google OAuth login' })
  @ApiSecurity('oauth2')
  googleAuth() {
    // Handled by Passport
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleAuthCallback(@Req() req: any) {
    // Handle OAuth callback
    return req.user;
  }

  @Public()
  @Get('microsoft')
  @ApiOperation({ summary: 'Microsoft OAuth login' })
  @ApiSecurity('oauth2')
  microsoftAuth() {
    // Handled by Passport
  }

  @Public()
  @Get('microsoft/callback')
  @ApiOperation({ summary: 'Microsoft OAuth callback' })
  async microsoftAuthCallback(@Req() req: any) {
    return req.user;
  }

  // Admin endpoints with role-based access
  @Get('admin/users')
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  @ApiResponse({ status: 200, description: 'Users retrieved' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getAllUsers() {
    // Implementation
    return { message: 'Admin endpoint' };
  }

  @Get('moderator/reports')
  @Roles('admin', 'moderator')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get reports (Admin or Moderator)' })
  async getReports() {
    return { message: 'Moderator endpoint' };
  }

  @Post('permission-test')
  @Permissions('orders:write', 'orders:delete')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Test permission-based access' })
  async permissionTest() {
    return { message: 'Permission granted' };
  }
}