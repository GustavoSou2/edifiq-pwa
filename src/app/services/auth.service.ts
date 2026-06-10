import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  active: boolean;
}

export interface AuthResponse {
  tokenType: string;
  accessToken: string;
  expiresAt: string;
  userId: string;
  tenantId: string;
  user: User;
}

export interface TenantSummary {
  slug: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = 'http://localhost:8081/api/v1/auth';

  // Signals para estado reativo no app
  readonly currentUser = signal<User | null>(this.loadUserFromStorage());
  readonly currentTenantId = signal<string | null>(this.loadTenantFromStorage());

  login(email: string, password: string, tenantSlug?: string): Observable<AuthResponse> {
    const body: { email: string; password: string; tenantSlug?: string } = { email, password };
    if (tenantSlug) {
      body.tenantSlug = tenantSlug;
    }
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, body).pipe(
      tap((res) => {
        localStorage.setItem('accessToken', res.accessToken);
        localStorage.setItem('userId', res.userId);
        localStorage.setItem('tenantId', res.tenantId);
        localStorage.setItem('user', JSON.stringify(res.user));

        this.currentUser.set(res.user);
        this.currentTenantId.set(res.tenantId);
      })
    );
  }

  getTenantsByEmail(email: string): Observable<TenantSummary[]> {
    return this.http.get<TenantSummary[]>(`${this.apiUrl}/tenants-by-email`, {
      params: { email }
    });
  }

  logout(): void {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('tenantId');
    localStorage.removeItem('user');

    this.currentUser.set(null);
    this.currentTenantId.set(null);
  }

  isLoggedIn(): boolean {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem('accessToken');
    }
    return false;
  }

  getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('accessToken');
    }
    return null;
  }

  private loadUserFromStorage(): User | null {
    if (typeof window !== 'undefined') {
      const raw = localStorage.getItem('user');
      if (raw) {
        try {
          return JSON.parse(raw) as User;
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private loadTenantFromStorage(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tenantId');
    }
    return null;
  }
}
