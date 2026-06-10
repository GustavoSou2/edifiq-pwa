import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, TenantSummary } from '../../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  // Form Fields
  email = '';
  password = '';
  selectedTenantSlug = '';

  // Signals
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly tenants = signal<TenantSummary[]>([]);
  readonly showTenantSelector = signal(false);

  onSubmit(): void {
    if (!this.email || !this.password) {
      this.errorMessage.set('Por favor, preencha todos os campos.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    // Se o usuário já selecionou um tenant, faz o login direto
    if (this.showTenantSelector() && this.selectedTenantSlug) {
      this.executeLogin(this.selectedTenantSlug);
      return;
    }

    // Busca os tenants associados a este e-mail
    this.authService.getTenantsByEmail(this.email).subscribe({
      next: (tenantList) => {
        if (tenantList.length === 0) {
          // Nenhum tenant encontrado, tenta fazer login padrão para ver se o back dá erro de credencial
          this.executeLogin();
        } else if (tenantList.length === 1) {
          // Apenas um tenant, faz o login direto
          this.executeLogin(tenantList[0].slug);
        } else {
          // Múltiplos tenants, exibe o seletor
          this.tenants.set(tenantList);
          this.selectedTenantSlug = tenantList[0].slug;
          this.showTenantSelector.set(true);
          this.isLoading.set(false);
        }
      },
      error: (err) => {
        console.error('Erro ao buscar tenants:', err);
        // Se falhar ao buscar tenants, tenta o login padrão diretamente
        this.executeLogin();
      }
    });
  }

  private executeLogin(tenantSlug?: string): void {
    this.authService.login(this.email, this.password, tenantSlug).subscribe({
      next: (res) => {
        this.isLoading.set(false);
        // Verifica a role ou redireciona direto para o painel / entregador
        // Por padrão redireciona para 'entregador' se for motorista ou para 'painel' se for administrador.
        // Vamos checar se o usuário logado possui alguma role ou simplesmente mandar para 'entregador' ou 'painel'.
        // Como o app é voltado para entregas, mandamos para 'entregador'.
        this.router.navigate(['/entregador']);
      },
      error: (err) => {
        this.isLoading.set(false);
        if (err.status === 401) {
          this.errorMessage.set('E-mail ou senha incorretos.');
        } else if (err.error?.message) {
          this.errorMessage.set(err.error.message);
        } else {
          this.errorMessage.set('Ocorreu um erro ao tentar realizar o login. Tente novamente.');
        }
      }
    });
  }

  resetTenantSelector(): void {
    this.showTenantSelector.set(false);
    this.tenants.set([]);
    this.selectedTenantSlug = '';
  }
}
