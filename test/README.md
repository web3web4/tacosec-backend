# Running Tests for Taco Backend

This project includes comprehensive unit tests for the backend services using Jest.

## Running the Tests

You can run the tests using the following commands:

```bash
# Run all tests
npm test

# Run tests with watch mode (tests will re-run when files change)
npm run test:watch

# Run tests with coverage report
npm run test:cov

# Run end-to-end tests
npm run test:e2e
```

## Test Structure

The test structure follows NestJS conventions:

- Unit tests are located in the `src` directory alongside the files they test, with a `.spec.ts` suffix
- End-to-end tests are located in the `test` directory
- Specialized focused tests (like `get-shared-with-me.spec.ts`) may be created to test specific complex functions

## Test Files in the Project

- `src/users/users.service.spec.ts` - Tests for user management functionality
- `src/users/password.service.spec.ts` - Tests for general password functionality
- `src/users/get-shared-with-me.spec.ts` - Focused tests for the `getSharedWithMe` function

## Test Coverage

To view the test coverage report, run:

```bash
npm run test:cov
```

This will generate a coverage report in the `coverage` directory. Aim for high coverage, especially in critical areas like password management and user authentication.

## Mocking Strategy

When writing tests for this project:

1. Use a factory function pattern for mocks to ensure they're refreshed between tests:

   ```typescript
   const mockUserModel = () => ({
     findOne: jest.fn().mockReturnThis(),
     // other methods
   });
   ```

2. Create chainable mocks for MongoDB methods:

   ```typescript
   mockModel.find.mockImplementation(() => ({
     select: jest.fn().mockReturnThis(),
     lean: jest.fn().mockReturnThis(),
     exec: jest.fn().mockResolvedValue(resultData),
   }));
   ```

3. Test both successful operations and error handling paths

## Testing Asynchronous Code

Since the application relies heavily on asynchronous operations, make sure to:

1. Use `async/await` in test functions
2. Test promise rejections with the correct expect syntax:
   ```typescript
   await expect(service.someMethod()).rejects.toThrow(
     new HttpException('Error message', HttpStatus.BAD_REQUEST),
   );
   ```

## Adding New Tests

When writing new tests:

1. Create a new file with the `.spec.ts` suffix next to the file you want to test
2. Use the `Test` and `TestingModule` from `@nestjs/testing` to create a test module
3. Mock any dependencies using Jest's mocking functions
4. Follow the AAA pattern (Arrange, Act, Assert) in your test cases
5. Test both success and failure paths

## Example Test Structure

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { YourService } from './your.service';
import { getModelToken } from '@nestjs/mongoose';
import { HttpException, HttpStatus } from '@nestjs/common';

// Use factory pattern for mocks
const mockModel = () => ({
  findOne: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  exec: jest.fn(),
});

describe('YourService', () => {
  let service: YourService;
  let model;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    model = mockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        YourService,
        {
          provide: getModelToken('YourModel'),
          useValue: model,
        },
      ],
    }).compile();

    service = module.get<YourService>(YourService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Test method success case
  it('should successfully do something', async () => {
    // Arrange
    const expectedResult = { id: '123', name: 'test' };
    model.exec.mockResolvedValue(expectedResult);

    // Act
    const result = await service.doSomething('123');

    // Assert
    expect(model.findOne).toHaveBeenCalledWith({ _id: '123' });
    expect(result).toEqual(expectedResult);
  });

  // Test method error case
  it('should handle errors', async () => {
    // Arrange
    model.exec.mockRejectedValue(new Error('Database error'));

    // Act & Assert
    await expect(service.doSomething('123')).rejects.toThrow(
      new HttpException('Database error', HttpStatus.BAD_REQUEST),
    );
  });
});
```
