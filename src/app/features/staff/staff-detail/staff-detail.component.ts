import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { StaffService } from '../../../core/services/staff.service';
import { AppointmentService } from '../../../core/services/appointment.service';
import { User, WorkingHours, Appointment, DayOfWeek } from '../../../core/models';

@Component({
  selector: 'app-staff-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './staff-detail.component.html',
  styleUrl: './staff-detail.component.scss'
})
export class StaffDetailComponent implements OnInit {
  staff = signal<User | null>(null);
  workingHours = signal<WorkingHours[]>([]);
  upcomingAppointments = signal<Appointment[]>([]);
  loading = signal(true);
  saving = signal(false);
  activeTab = signal<'schedule' | 'hours' | 'services'>('schedule');

  hoursForm: FormGroup;
  daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private staffService: StaffService,
    private appointmentService: AppointmentService
  ) {
    this.hoursForm = this.fb.group({});
    this.daysOfWeek.forEach((_, index) => {
      this.hoursForm.addControl(`day_${index}_active`, this.fb.control(false));
      this.hoursForm.addControl(`day_${index}_start`, this.fb.control('09:00'));
      this.hoursForm.addControl(`day_${index}_end`, this.fb.control('17:00'));
    });
  }

  ngOnInit() {
    const staffId = this.route.snapshot.paramMap.get('id');
    if (staffId) {
      this.loadStaffData(staffId);
    }
  }

  async loadStaffData(staffId: string) {
    this.loading.set(true);
    try {
      const [staffResult, hoursData, appointmentsData] = await Promise.all([
        this.staffService.getStaffMember(staffId),
        this.staffService.getStaffWorkingHours(staffId),
        this.appointmentService.getStaffAppointments(staffId)
      ]);

      this.staff.set(staffResult.data);
      this.workingHours.set(hoursData);

      // Filter to upcoming appointments only
      const now = new Date();
      const upcoming = appointmentsData
        .filter(apt => new Date(apt.start_time) > now && apt.status !== 'cancelled')
        .slice(0, 10);
      this.upcomingAppointments.set(upcoming);

      // Populate form with existing hours
      hoursData.forEach(hours => {
        this.hoursForm.patchValue({
          [`day_${hours.day_of_week}_active`]: hours.is_active,
          [`day_${hours.day_of_week}_start`]: hours.start_time,
          [`day_${hours.day_of_week}_end`]: hours.end_time
        });
      });
    } catch (error) {
      console.error('Error loading staff data:', error);
    } finally {
      this.loading.set(false);
    }
  }

  setTab(tab: 'schedule' | 'hours' | 'services') {
    this.activeTab.set(tab);
  }

  async saveWorkingHours() {
    const staffMember = this.staff();
    if (!staffMember) return;

    this.saving.set(true);
    try {
      const hoursToSave: Partial<WorkingHours>[] = this.daysOfWeek.map((_, index) => ({
        user_id: staffMember.id,
        day_of_week: index as DayOfWeek,
        is_active: this.hoursForm.get(`day_${index}_active`)?.value || false,
        start_time: this.hoursForm.get(`day_${index}_start`)?.value || '09:00',
        end_time: this.hoursForm.get(`day_${index}_end`)?.value || '17:00'
      }));

      await this.staffService.updateStaffWorkingHours(staffMember.id, hoursToSave);
      // Reload hours
      const updatedHours = await this.staffService.getStaffWorkingHours(staffMember.id);
      this.workingHours.set(updatedHours);
    } catch (error) {
      console.error('Error saving working hours:', error);
    } finally {
      this.saving.set(false);
    }
  }

  async removeStaff() {
    const staffMember = this.staff();
    if (!staffMember) return;

    if (confirm(`Are you sure you want to remove ${staffMember.first_name} ${staffMember.last_name} from your team?`)) {
      try {
        await this.staffService.removeStaff(staffMember.id);
        this.router.navigate(['/staff']);
      } catch (error) {
        console.error('Error removing staff:', error);
      }
    }
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  }

  formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'confirmed': return 'status-confirmed';
      case 'pending': return 'status-pending';
      case 'completed': return 'status-completed';
      case 'cancelled': return 'status-cancelled';
      case 'no_show': return 'status-no-show';
      default: return '';
    }
  }
}
