import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { AuthService } from './auth.service';
class PinLoginDto { @IsString() companyId!: string; @IsString() @Length(4, 12) pin!: string; }
@Controller('auth')
export class AuthController { constructor(private readonly auth: AuthService) {} @Post('pin') login(@Body() input: PinLoginDto) { return this.auth.loginWithPin(input.companyId, input.pin); } @Get('session') session() { return { valid: true }; } }
