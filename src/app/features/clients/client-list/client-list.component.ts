import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ClientService } from '../../../core/services/client.service';
import { UserProfile } from '../../../core/models';

@Component({
  selector: 'app-client-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './client-list.component.html',
  styleUrl: './client-list.component.scss'
})
export class ClientListComponent implements OnInit {
  clients = signal<UserProfile[]>([]);
  filteredClients = signal<UserProfile[]>([]);
  searchTerm = '';
  isLoading = signal(true);

  constructor(
    private authService: AuthService,
    private clientService: ClientService
  ) {}

  async ngOnInit() {
    await this.loadClients();
  }

  async loadClients() {
    this.isLoading.set(true);
    const user = this.authService.user();

    if (user?.business_id) {
      const { data } = await this.clientService.loadClients(user.business_id);
      this.clients.set(data || []);
      this.filteredClients.set(data || []);
    }

    this.isLoading.set(false);
  }

  onSearch() {
    if (!this.searchTerm.trim()) {
      this.filteredClients.set(this.clients());
      return;
    }

    const term = this.searchTerm.toLowerCase();
    this.filteredClients.set(
      this.clients().filter(client =>
        client.first_name.toLowerCase().includes(term) ||
        client.last_name.toLowerCase().includes(term) ||
        client.phone?.includes(term)
      )
    );
  }

  clearSearch() {
    this.searchTerm = '';
    this.filteredClients.set(this.clients());
  }
}
