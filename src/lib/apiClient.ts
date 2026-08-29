import { auth } from './firebaseClient';
import type { ApiResponse } from '../types';

export class ApiClient {
  private static async getHeaders(): Promise<HeadersInit> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const currentUser = auth.currentUser;
    if (currentUser) {
      const idToken = await currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    return headers;
  }

  static async get<T>(url: string): Promise<T> {
    const headers = await this.getHeaders();
    const res = await fetch(url, { method: 'GET', headers });
    const json: ApiResponse<T> = await res.json().catch(() => ({
      success: false,
      error: `Failed to parse response (${res.status} ${res.statusText})`
    }));

    if (!res.ok || !json.success) {
      throw new Error(json.error || `HTTP ${res.status}: Failed to fetch`);
    }

    return json.data as T;
  }

  static async post<T, B = unknown>(url: string, body?: B): Promise<T> {
    const headers = await this.getHeaders();
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json: ApiResponse<T> = await res.json().catch(() => ({
      success: false,
      error: `Failed to parse response (${res.status} ${res.statusText})`
    }));

    if (!res.ok || !json.success) {
      throw new Error(json.error || `HTTP ${res.status}: Request failed`);
    }

    return json.data as T;
  }

  static async put<T, B = unknown>(url: string, body?: B): Promise<T> {
    const headers = await this.getHeaders();
    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json: ApiResponse<T> = await res.json().catch(() => ({
      success: false,
      error: `Failed to parse response (${res.status} ${res.statusText})`
    }));

    if (!res.ok || !json.success) {
      throw new Error(json.error || `HTTP ${res.status}: Request failed`);
    }

    return json.data as T;
  }

  static async delete<T>(url: string): Promise<T> {
    const headers = await this.getHeaders();
    const res = await fetch(url, { method: 'DELETE', headers });
    const json: ApiResponse<T> = await res.json().catch(() => ({
      success: false,
      error: `Failed to parse response (${res.status} ${res.statusText})`
    }));

    if (!res.ok || !json.success) {
      throw new Error(json.error || `HTTP ${res.status}: Delete failed`);
    }

    return json.data as T;
  }
}
