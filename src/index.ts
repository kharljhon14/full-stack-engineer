import fs from 'fs';
import { JSDOM } from 'jsdom';
import { URLSearchParams } from 'url';
import crypto from 'crypto';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

const SESSION_COOKIE = `
  JSESSIONID=2636d709-1d67-4031-bb95-3d58f0be958c;
  _csrf_token=bc132f57c191534ee02825745baf62d80f679c8381c3adbe599c7f16c724ce63;
  user_preferences=eyJ0aGVtZSI6ImxpZ2h0IiwibGFuZ3VhZ2UiOiJlbiIsInRpbWV6b25lIjoiVVRDIiwibm90aWZpY2F0aW9ucyI6dHJ1ZX0%3D;
  analytics_id=analytics_68e598e9943589cc825c16237d53cb09;
  session_fingerprint=fff2ec726ccbf6a2b794e6086a99fa8c5a1747682b1d4627c2df5d0846752e8c;
  feature_flags=eyJuZXdEYXNoYm9hcmQiOnRydWUsImJldGFGZWF0dXJlcyI6ZmFsc2UsImFkdmFuY2VkU2V0dGluZ3MiOnRydWUsImV4cGVyaW1lbnRhbFVJIjpmYWxzZX0%3D;
  tracking_consent=accepted;
  device_id=device_3dcd3bd3977008964ec626d9
`.replace(/\s+/g, '');

function createCheckcode(input: string): string {
  return crypto.createHmac('sha1', 'mys3cr3t').update(input).digest('hex').toUpperCase();
}

async function request(
  url: string,
  method: string,
  headers?: HeadersInit,
  body?: BodyInit,
  responseType: 'json' | 'text' = 'json'
): Promise<any> {
  const res = await fetch(url, { method, headers, body });

  if (!res.ok) {
    console.error(`Error ${res.status}:`, await res.text());
    throw new Error(`Failed to fetch from ${url}`);
  }

  return responseType === 'json' ? await res.json() : await res.text();
}

function saveToFile(filename: string, data: any): void {
  fs.writeFile(filename, JSON.stringify(data, null, 2), (err) => {
    if (err) {
      console.error(err);
      throw new Error(`Couldn't save file: ${filename}`);
    }
  });
}

async function main() {
  try {
    const users: User[] = await request('https://challenge.sunvoy.com/api/users', 'POST', {
      cookie: SESSION_COOKIE
    });

    const html = await request(
      'https://challenge.sunvoy.com/settings/tokens',
      'GET',
      { cookie: SESSION_COOKIE },
      undefined,
      'text'
    );

    const dom = new JSDOM(html);
    const inputs = dom.window.document.querySelectorAll('input');
    const formParams = new URLSearchParams();

    inputs.forEach((input) => {
      if (input.id && input.value) {
        formParams.append(input.id, input.value);
      }
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    formParams.set('timestamp', timestamp);

    const keysToSign = [
      'access_token',
      'apiuser',
      'language',
      'openId',
      'operateId',
      'userId',
      'timestamp'
    ];

    const signableData = Object.fromEntries(
      keysToSign.map((key) => [key, formParams.get(key) ?? ''])
    );

    const sortedPayload = Object.keys(signableData)
      .sort()
      .map((key) => `${key}=${encodeURIComponent(signableData[key])}`)
      .join('&');

    formParams.append('checkcode', createCheckcode(sortedPayload));

    const authenticatedUser: User = await request(
      'https://api.challenge.sunvoy.com/api/settings',
      'POST',
      {
        cookie: SESSION_COOKIE,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      formParams.toString()
    );

    users.push(authenticatedUser);
    saveToFile('users.json', users);

    console.log('Users list saved successfully.');
  } catch (error) {
    console.error('Something went wrong:', error);
  }
}

main();
