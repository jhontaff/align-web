import { Component, inject } from '@angular/core';
import { AuthStateService } from '../../core/auth/auth-state.service';

@Component({
  selector: 'app-home',
  imports: [],
  templateUrl: './home.html'
})
export class Home {
  protected readonly authState = inject(AuthStateService);
}
