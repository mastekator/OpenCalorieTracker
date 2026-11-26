import { describe, expect, it } from 'vitest';
import { isLocalAiHost, providerKey } from './ai-consent.js';

describe('isLocalAiHost', () => {
  it.each([
    'http://ollama:11434/v1',
    'http://LLM./v1',
    'http://localhost:8080',
    'http://api.localhost',
    'http://127.0.0.1:1234',
    'http://0.0.0.0:11434',
    'http://10.1.2.3',
    'http://172.16.0.1',
    'http://172.31.255.1',
    'http://192.168.1.5:8000/v1',
    'http://169.254.1.1',
    'http://nas.local',
    'http://box.lan',
    'http://llm.internal',
    'http://[::1]:8080',
    'http://[fd00::1]',
    'http://[fe80::1]',
    'http://[::ffff:127.0.0.1]',
    'http://[::ffff:192.168.0.2]',
  ])('%s is local', (url) => expect(isLocalAiHost(url)).toBe(true));

  it.each([
    'https://api.openai.com/v1',
    'https://ollama.example.com',
    'http://172.32.0.1',
    'http://192.169.0.1',
    'http://8.8.8.8',
    'http://[2001:db8::1]',
    'http://[::ffff:8.8.8.8]',
    'http://local.example.com',
    'not a url',
    '',
  ])('%s is not local', (url) => expect(isLocalAiHost(url)).toBe(false));
});

describe('providerKey', () => {
  it('is the provider id, whatever the model or key', () => {
    expect(providerKey({ provider: 'google' })).toBe('google');
    expect(providerKey({ provider: 'openai', baseUrl: 'https://x.io' })).toBe(
      'openai',
    );
  });

  it('changes with the provider and the host', () => {
    const a = providerKey({
      provider: 'openai-compatible',
      baseUrl: 'https://llm.example.com/v1',
    });
    expect(a).toBe('openai-compatible:llm.example.com');
    expect(
      providerKey({
        provider: 'openai-compatible',
        baseUrl: 'https://LLM.example.com/other',
      }),
    ).toBe(a);
    expect(
      providerKey({
        provider: 'openai-compatible',
        baseUrl: 'https://other.example.com/v1',
      }),
    ).not.toBe(a);
    expect(providerKey({ provider: 'openrouter' })).not.toBe(a);
  });
});
