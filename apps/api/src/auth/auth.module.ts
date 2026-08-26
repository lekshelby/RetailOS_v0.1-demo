import { Module } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
@Module({ controllers: [AuthController], providers: [AuthService, PrismaService, SessionService], exports: [SessionService] }) export class AuthModule {}
