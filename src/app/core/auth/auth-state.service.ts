import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap, tap } from 'rxjs';
import { AuthResponse } from '../models/auth-response.model';
import { UserResponse } from '../models/user-response.model';
import { clearToken, getToken, setToken } from './token-storage';

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
}


@Injectable({ providedIn: 'root' })
export class AuthStateService {
    private readonly _user = signal<UserResponse | null>(null);
    private readonly _isAuthenticated = signal<boolean>(getToken() !== null);

    readonly user = this._user.asReadonly();
    readonly isAuthenticated = this._isAuthenticated.asReadonly();

    constructor(private readonly http: HttpClient) { }

    private applyAuthResponse(auth: AuthResponse): Observable<UserResponse> {
        setToken(auth.accessToken);
        this._isAuthenticated.set(true);
        return this.hydrateUser();
    }

    login(credentials: LoginRequest): Observable<UserResponse> {
        return this.http.post<AuthResponse>('/auth/login', credentials).pipe(
            switchMap(auth => this.applyAuthResponse(auth))
        );
    }

    register(request: RegisterRequest): Observable<UserResponse> {
        return this.http.post<AuthResponse>('/auth/register', request).pipe(
            switchMap(auth => this.applyAuthResponse(auth))
        );
    }



    hydrateUser(): Observable<UserResponse> {
        return this.http.get<UserResponse>('/auth/me').pipe(
            tap(user => this._user.set(user))
        );
    }

    hydrateIfAuthenticated(): void {
        if (this._isAuthenticated()) {
            this.hydrateUser().subscribe();
        }
    }

    logout(): void {
        clearToken();
        this._user.set(null);
        this._isAuthenticated.set(false);
    }
}
