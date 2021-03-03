/* eslint-disable @typescript-eslint/no-unused-vars */

import { expect } from 'chai';

import { Fixture, loadFixture } from '../common';

export default function run(): void {
	let fixture: Fixture;

	beforeEach(async function () {
		fixture = await loadFixture();
	});

	describe('exit', function () {
		it('should unstake all');

		it('should redeem all rewards');
	});
}
