import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateHost } from '../src/services/parser.service.js';

test('回环地址应拦截', () => {
  assert.equal(isPrivateHost('localhost'), true);
  assert.equal(isPrivateHost('127.0.0.1'), true);
  assert.equal(isPrivateHost('127.0.0.2'), true);
  assert.equal(isPrivateHost('127.255.255.255'), true);
});

test('私网 IPv4 应拦截', () => {
  assert.equal(isPrivateHost('10.0.0.1'), true);
  assert.equal(isPrivateHost('10.255.255.255'), true);
  assert.equal(isPrivateHost('192.168.1.1'), true);
  assert.equal(isPrivateHost('172.16.0.1'), true);
  assert.equal(isPrivateHost('172.31.255.255'), true);
});

test('保留/链路本地地址应拦截', () => {
  assert.equal(isPrivateHost('169.254.1.1'), true);
  assert.equal(isPrivateHost('100.64.0.1'), true);
  assert.equal(isPrivateHost('0.0.0.0'), true);
  assert.equal(isPrivateHost('192.0.2.10'), true);
});

test('IPv6 回环/链路本地/ULA 应拦截', () => {
  assert.equal(isPrivateHost('::1'), true);
  assert.equal(isPrivateHost('fe80::1'), true);
  assert.equal(isPrivateHost('fc00::1'), true);
  assert.equal(isPrivateHost('fd00::1'), true);
  assert.equal(isPrivateHost('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateHost('::ffff:192.168.1.1'), true);
});

test('公网地址不应拦截', () => {
  assert.equal(isPrivateHost('8.8.8.8'), false);
  assert.equal(isPrivateHost('1.1.1.1'), false);
  assert.equal(isPrivateHost('114.114.114.114'), false);
  assert.equal(isPrivateHost('172.32.0.1'), false);
  assert.equal(isPrivateHost('example.com'), false);
});
