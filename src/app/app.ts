import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthStateService } from './core/auth/auth-state.service';
import { ChatWidget } from './features/chat/chat-widget';
import { ThemeToggle } from './layout/theme-toggle/theme-toggle';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ChatWidget, ThemeToggle],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('align-web');
  protected readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);

  constructor() {
    this.authState.hydrateIfAuthenticated();
  }

  protected onLogout(): void {
    this.authState.logout();
    this.router.navigate(['/login']);
  }
}
