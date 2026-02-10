/**
 * 애플리케이션 진입점
 *
 * NestJS 애플리케이션을 부트스트랩하고 전역 설정을 적용합니다.
 * .env 파일이 없거나 FORCE_SETUP=true인 경우 웹 기반 Setup Wizard를 실행합니다.
 * ValidationPipe, Helmet, CORS, Swagger 등의 전역 미들웨어를 구성합니다.
 *
 * @module main
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

/**
 * 애플리케이션 부트스트랩 함수
 *
 * @description
 * 0. .env 파일 존재 여부 확인 → Setup Wizard 분기
 * 1. NestFactory로 애플리케이션 인스턴스 생성
 * 2. 보안 미들웨어(Helmet) 적용
 * 3. CORS 정책 구성
 * 4. 전역 ValidationPipe 설정 (whitelist, forbidNonWhitelisted, transform)
 * 5. 전역 API 프리픽스 설정 (api/v1)
 * 6. Swagger API 문서 생성 (환경 설정에 따라)
 * 7. 지정된 포트에서 서버 시작
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const envPath = join(process.cwd(), '.env');
  const envExists = existsSync(envPath);
  const forceSetup = process.env.FORCE_SETUP === 'true';

  if (!envExists || forceSetup) {
    logger.log('Setup Wizard를 시작합니다.');
    const { startSetupServer } = await import('./setup/setup.server');
    await startSetupServer(4321, !envExists || forceSetup);
    logger.log('Setup Wizard 완료 → NestJS 앱을 부팅합니다.');
  }

  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 3000);
  const apiVersion = configService.get<string>('app.apiVersion', 'v1');
  const nodeEnv = configService.get<string>('app.nodeEnv', 'local');
  const corsOrigins = configService.get<string>('CORS_ORIGINS', '*');
  const swaggerEnabled = configService.get<string>('SWAGGER_ENABLED', 'true');
  const swaggerPath = configService.get<string>('SWAGGER_PATH', '/api-docs');

  app.use(helmet());

  app.enableCors({
    origin: corsOrigins === '*' ? true : corsOrigins.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix(`api/${apiVersion}`);

  if (swaggerEnabled === 'true' && nodeEnv !== 'prod') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('NestJS Engine API')
      .setDescription('NestJS Backend Engine API Documentation')
      .setVersion(apiVersion)
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          description: 'JWT Access Token',
          in: 'header',
        },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    const resolvedSwaggerPath = swaggerPath.startsWith('/')
      ? swaggerPath.slice(1)
      : swaggerPath;
    SwaggerModule.setup(resolvedSwaggerPath, app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
  }

  await app.listen(port);

  logger.log(`Environment: ${nodeEnv}`);
  logger.log(`Server running on http://localhost:${port}/api/${apiVersion}`);

  if (swaggerEnabled === 'true' && nodeEnv !== 'prod') {
    const resolvedSwaggerPath = swaggerPath.startsWith('/')
      ? swaggerPath.slice(1)
      : swaggerPath;
    logger.log(
      `Swagger docs: http://localhost:${port}/${resolvedSwaggerPath}`,
    );
  }
}

bootstrap();
