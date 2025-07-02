import { Test, TestingModule } from '@nestjs/testing';
import { ReportService } from '../../src/reports/report.service';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../src/users/schemas/user.schema';
import {
  Report,
  ReportDocument,
} from '../../src/reports/schemas/report.schema';
import {
  Password,
  PasswordDocument,
} from '../../src/passwords/schemas/password.schema';
import { ConfigService } from '@nestjs/config';

describe('ReportService', () => {
  let service: ReportService;
  let userModel: Model<UserDocument>;
  let reportModel: Model<ReportDocument>;
  let passwordModel: Model<PasswordDocument>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportService,
        {
          provide: getModelToken(User.name),
          useValue: {
            findOne: jest.fn(),
            updateOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getModelToken(Report.name),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findById: jest.fn(),
            countDocuments: jest.fn(),
            distinct: jest.fn(),
            // Add constructor for new Report instances
            constructor: jest.fn().mockImplementation(() => ({
              save: jest.fn().mockResolvedValue({}),
            })),
          },
        },
        {
          provide: getModelToken(Password.name),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key, defaultValue) => defaultValue),
          },
        },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
    userModel = module.get<Model<UserDocument>>(getModelToken(User.name));
    reportModel = module.get<Model<ReportDocument>>(getModelToken(Report.name));
    passwordModel = module.get<Model<PasswordDocument>>(
      getModelToken(Password.name),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // Basic tests for each method
  describe('reportUser', () => {
    it('should be defined', () => {
      expect(service.reportUser).toBeDefined();
    });
  });

  describe('getReportsByUser', () => {
    it('should be defined', () => {
      expect(service.getReportsByUser).toBeDefined();
    });
  });

  describe('isUserRestricted', () => {
    it('should be defined', () => {
      expect(service.isUserRestricted).toBeDefined();
    });
  });

  describe('resolveReport', () => {
    it('should be defined', () => {
      expect(service.resolveReport).toBeDefined();
    });
  });

  describe('getAllReportedUsers', () => {
    it('should be defined', () => {
      expect(service.getAllReportedUsers).toBeDefined();
    });
  });
});
