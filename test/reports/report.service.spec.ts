import { Test, TestingModule } from '@nestjs/testing';
import { ReportService } from '../../src/reports/report.service';
import { getModelToken } from '@nestjs/mongoose';
import { User } from '../../src/users/schemas/user.schema';
import { Report } from '../../src/reports/schemas/report.schema';
import { Password } from '../../src/passwords/schemas/password.schema';
import { AppConfigService } from '../../src/common/config/app-config.service';

describe('ReportService', () => {
  let service: ReportService;

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
          provide: AppConfigService,
          useValue: {
            maxReportsBeforeBan: 10,
            maxPercentageOfReportsRequiredForBan: 0.5,
          },
        },
      ],
    }).compile();

    service = module.get<ReportService>(ReportService);
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
