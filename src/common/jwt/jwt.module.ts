import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigService } from '../config/app-config.service';

@Module({
    imports: [
        JwtModule.registerAsync({
            useFactory: async (appConfig: AppConfigService) => {
                return {
                    secret: appConfig.jwtSecret,
                    signOptions: { expiresIn: appConfig.jwtExpiresIn },
                };
            },
            inject: [AppConfigService],
        }),
    ],
    exports: [JwtModule],
})
export class SharedJwtModule { }
