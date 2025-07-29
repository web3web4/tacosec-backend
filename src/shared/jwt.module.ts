import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            'JWT_SECRET is not configured. Please set this environment variable.',
          );
        }

        // Get JWT expiration time from environment variable, default to '24h'
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') || '24h';

        return {
          secret,
          signOptions: { expiresIn },
        };
      },
      inject: [ConfigService],
    }),
  ],
  exports: [JwtModule],
})
export class SharedJwtModule {}
