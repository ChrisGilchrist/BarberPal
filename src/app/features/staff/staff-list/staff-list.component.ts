import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { StaffService } from '../../../core/services/staff.service';
import { UserProfile } from '../../../core/models';

@Component({
  selector: 'app-staff-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './staff-list.component.html',
  styleUrl: './staff-list.component.scss'
})
export class StaffListComponent implements OnInit {
  staff = signal<UserProfile[]>([]);
  isLoading = signal(true);
  showAddModal = signal(false);

  // New staff form
  newFirstName = '';
  newLastName = '';
  newEmail = '';
  isAdding = signal(false);
  addError = signal<string | null>(null);

  constructor(
    private authService: AuthService,
    private staffService: StaffService
  ) {}

  async ngOnInit() {
    await this.loadStaff();
  }

  async loadStaff() {
    this.isLoading.set(true);
    const user = this.authService.user();

    if (user?.business_id) {
      const { data } = await this.staffService.loadStaff(user.business_id);
      this.staff.set(data || []);
    }

    this.isLoading.set(false);
  }

  openAddModal() {
    this.newFirstName = '';
    this.newLastName = '';
    this.newEmail = '';
    this.addError.set(null);
    this.showAddModal.set(true);
  }

  closeAddModal() {
    this.showAddModal.set(false);
  }

  async addStaff() {
    if (!this.newFirstName || !this.newLastName) {
      this.addError.set('Name is required');
      return;
    }

    this.isAdding.set(true);
    this.addError.set(null);

    try {
      const user = this.authService.user();
      if (!user?.business_id) throw new Error('No business found');

      const { error } = await this.staffService.addStaffMember(
        this.newEmail,
        this.newFirstName,
        this.newLastName,
        user.business_id
      );

      if (error) throw new Error(error);

      this.closeAddModal();
      await this.loadStaff();
    } catch (err: any) {
      this.addError.set(err.message || 'Failed to add staff');
    }

    this.isAdding.set(false);
  }

  async removeStaff(member: UserProfile) {
    if (member.id === this.authService.user()?.id) {
      alert("You can't remove yourself!");
      return;
    }

    if (confirm(`Are you sure you want to remove ${member.first_name} ${member.last_name}?`)) {
      await this.staffService.removeStaffMember(member.id);
      await this.loadStaff();
    }
  }

  getRoleBadgeClass(role: string): string {
    return role === 'owner' ? 'status-confirmed' : 'status-pending';
  }
}
