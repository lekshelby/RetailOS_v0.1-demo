import { hashPin, verifyPin } from './pin';
describe('cashier PIN hashing', () => { it('verifies the correct PIN only', () => { const hash = hashPin('1234'); expect(verifyPin('1234', hash)).toBe(true); expect(verifyPin('4321', hash)).toBe(false); }); });
