import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, closeTestApp } from '../test.config';
import { clearDatabase, closeDatabaseConnection } from '../test.utils';

describe('Users Integration Tests', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await clearDatabase(app);
  });

  afterAll(async () => {
    await closeDatabaseConnection(app);
    await closeTestApp(app);
  });

  describe('User Registration', () => {
    it('should register a new user', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Test123!',
        telegramId: '123456789',
      };

      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send(userData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.username).toBe(userData.username);
      expect(response.body.email).toBe(userData.email);
      expect(response.body).not.toHaveProperty('password');
    });

    it('should not register a user with existing email', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Test123!',
        telegramId: '123456789',
      };

      // First registration
      await request(app.getHttpServer())
        .post('/users/register')
        .send(userData)
        .expect(201);

      // Second registration with same email
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send(userData)
        .expect(400);

      expect(response.body.message).toContain('already exists');
    });
  });

  describe('User Authentication', () => {
    it('should login with valid credentials', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Test123!',
        telegramId: '123456789',
      };

      // Register user
      await request(app.getHttpServer())
        .post('/users/register')
        .send(userData)
        .expect(201);

      // Login
      const response = await request(app.getHttpServer())
        .post('/users/login')
        .send({
          email: userData.email,
          password: userData.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
    });

    it('should not login with invalid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/login')
        .send({
          email: 'wrong@example.com',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body.message).toContain('Invalid credentials');
    });
  });
});
