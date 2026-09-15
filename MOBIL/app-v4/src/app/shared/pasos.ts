import {
  Component,
  Directive,
  EventEmitter,
  HostListener,
  Input,
  Output,
} from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';

/**
 * Paginación de los formularios largos (AM, PM).
 *
 * Corrección transversal 1 de 03-pantallas.md: en la app vieja las flechas
 * `<` `>` flotan a media altura y quedan ENCIMA de "Seleccione Personal" y
 * de "Unidad de Labor", tapando el control. Aquí van a una barra fija
 * inferior, fuera del área de scroll, con el indicador de paso al medio —
 * que tampoco existía: no había forma de saber cuántas tareas se llevaban
 * cargadas.
 *
 * Decisión cerrada: **swipe y flechas, los dos**. Ninguno puede ser el único
 * camino — el swipe es el gesto natural, las flechas son lo descubrible.
 * El swipe lo aporta `SwipePasosDirective`, sin dependencias nuevas: Ionic 9
 * ya no trae `ion-slides` y meter Swiper por dos gestos no se paga.
 */
@Component({
  selector: 'app-barra-pasos',
  standalone: true,
  imports: [IonButton, IonIcon],
  template: `
    <div class="barra-pasos">
      <ion-button
        class="paso-anterior"
        fill="clear"
        [disabled]="indice === 0"
        (click)="anterior.emit()"
        aria-label="Paso anterior"
      >
        <ion-icon slot="icon-only" name="chevron-back-outline"></ion-icon>
      </ion-button>

      <div class="indicador">
        <span class="paso">{{ indice + 1 }} / {{ total }}</span>
        @if (etiqueta) {
          <span class="etiqueta">{{ etiqueta }}</span>
        }
      </div>

      <ion-button
        class="paso-siguiente"
        fill="clear"
        [disabled]="indice >= total - 1"
        (click)="siguiente.emit()"
        aria-label="Paso siguiente"
      >
        <ion-icon slot="icon-only" name="chevron-forward-outline"></ion-icon>
      </ion-button>
    </div>
  `,
  styles: [
    `
      .barra-pasos {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2px 4px;
        background: var(--ion-toolbar-background, var(--ion-background-color));
        border-top: 1px solid var(--ion-color-step-150, #e0e0e0);
      }
      .indicador {
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1.2;
      }
      .paso {
        font-weight: 600;
        font-size: 0.95rem;
      }
      .etiqueta {
        font-size: 0.75rem;
        color: var(--ion-color-medium);
      }
    `,
  ],
})
export class BarraPasosComponent {
  @Input({ required: true }) indice = 0;
  @Input({ required: true }) total = 1;
  /** Texto chico bajo el "2 / 5", p. ej. "Tarea 1". */
  @Input() etiqueta = '';

  @Output() anterior = new EventEmitter<void>();
  @Output() siguiente = new EventEmitter<void>();

  constructor() {
    addIcons({ chevronBackOutline, chevronForwardOutline });
  }
}

/**
 * Swipe horizontal sobre el contenido del formulario.
 *
 * Se ignora si el gesto es más vertical que horizontal (si no, cada scroll
 * cambiaría de paso) o si es demasiado corto. `passive: true` en los
 * listeners: nunca se llama preventDefault, así que el scroll sigue siendo
 * fluido.
 */
@Directive({
  selector: '[appSwipePasos]',
  standalone: true,
})
export class SwipePasosDirective {
  /** Distancia mínima en px para que cuente como swipe. */
  @Input() umbral = 60;

  @Output() swipeSiguiente = new EventEmitter<void>();
  @Output() swipeAnterior = new EventEmitter<void>();

  private x0 = 0;
  private y0 = 0;
  private activo = false;

  @HostListener('touchstart', ['$event'])
  onInicio(e: TouchEvent): void {
    if (e.touches.length !== 1) {
      this.activo = false;
      return;
    }
    this.x0 = e.touches[0].clientX;
    this.y0 = e.touches[0].clientY;
    this.activo = true;
  }

  @HostListener('touchend', ['$event'])
  onFin(e: TouchEvent): void {
    if (!this.activo || e.changedTouches.length === 0) {
      return;
    }
    this.activo = false;
    const dx = e.changedTouches[0].clientX - this.x0;
    const dy = e.changedTouches[0].clientY - this.y0;
    if (Math.abs(dx) < this.umbral || Math.abs(dx) <= Math.abs(dy)) {
      return;
    }
    if (dx < 0) {
      this.swipeSiguiente.emit();
    } else {
      this.swipeAnterior.emit();
    }
  }
}
