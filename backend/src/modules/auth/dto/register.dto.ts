import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // Upper bound matters: argon2 is deliberately expensive, so unbounded input
  // is a cheap DoS vector.
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;
}
