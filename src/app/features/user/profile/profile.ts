import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthStateService } from '../../../core/auth/auth-state.service';
import { prefersReducedMotion } from '../../../core/dom/prefers-reduced-motion';
import { extractErrorMessage } from '../../../core/http/extract-error-message';
import { PushService } from '../../../core/notifications/push.service';
import { ThemePreference, ThemeService } from '../../../core/theme/theme.service';
import { Avatar } from '../../../shared/ui/avatar/avatar';
import { Icon } from '../../../shared/ui/icon/icon';
import { APP_VERSION } from '../../../app-version';
// Excepción direccional de agregación (ver CLAUDE.md, generalizada junto con
// esta pantalla): profile/ importa servicios y modelos de habits/ y tasks/
// para mostrar estadísticas, nunca sus componentes.
import { HabitService } from '../../habits/habit.service';
import { TaskService } from '../../tasks/task.service';
import { UserService } from '../user.service';

const THEME_LABEL: Record<ThemePreference, string> = {
  system: 'Sistema',
  light: 'Claro',
  dark: 'Oscuro'
};

@Component({
  selector: 'app-profile',
  imports: [Avatar, Icon, RouterLink],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Profile implements OnInit {
  private readonly authState = inject(AuthStateService);
  private readonly router = inject(Router);
  private readonly habits = inject(HabitService);
  private readonly tasks = inject(TaskService);
  private readonly userService = inject(UserService);

  protected readonly push = inject(PushService);
  protected readonly theme = inject(ThemeService);

  protected readonly user = this.authState.user;
  protected readonly avatarUrl = this.userService.avatarUrl;
  protected readonly appVersion = APP_VERSION;

  protected readonly themeLabel = computed(() => THEME_LABEL[this.theme.preference()]);

  // Carga única al montar: esta pantalla no se queda detrás del chat como
  // Home/Finance/Habits, así que no se suscribe a DataRefreshService.
  protected readonly loadingStats = signal(true);
  protected readonly statsError = signal<string | null>(null);
  protected readonly bestStreak = signal(0);
  protected readonly completedTasks = signal(0);
  /** `null` = sin hábitos todavía, se pinta "—". */
  protected readonly consistencyPct = signal<number | null>(null);

  ngOnInit(): void {
    this.loadStats();
  }

  private loadStats(): void {
    this.statsError.set(null);

    forkJoin({
      habits: this.habits.list(),
      completed: this.tasks.list({ status: 'COMPLETED' }, { page: 0, size: 1 })
    }).subscribe({
      next: ({ habits, completed }) => {
        this.bestStreak.set(Math.max(...habits.map(h => h.longestStreak), 0));
        this.completedTasks.set(completed.totalElements);
        this.consistencyPct.set(
          habits.length === 0
            ? null
            : Math.round((habits.filter(h => h.currentStreak > 0).length / habits.length) * 100)
        );
        this.loadingStats.set(false);
      },
      error: err => {
        this.loadingStats.set(false);
        this.statsError.set(extractErrorMessage(err));
      }
    });
  }

  protected async onTogglePush(subscribe: boolean): Promise<void> {
    if (subscribe) {
      await this.push.enable();
    } else {
      await this.push.disable();
    }
  }

  protected async onTestNotification(): Promise<void> {
    await this.push.showTest();
  }

  protected async onLogout(): Promise<void> {
    await this.authState.logout();
    this.router.navigate(['/login']);
  }

  // Duración en TS y CSS deben coincidir: ver `.is-closing` en profile.scss.
  private static readonly EXIT_ANIMATION_MS = 250;

  protected readonly closing = signal(false);

  /** Llamado por `profileExitGuard` antes de que el router destruya la pantalla. */
  animateOut(): Promise<boolean> {
    this.closing.set(true);
    const delay = prefersReducedMotion() ? 0 : Profile.EXIT_ANIMATION_MS;
    return new Promise(resolve => setTimeout(() => resolve(true), delay));
  }
}
