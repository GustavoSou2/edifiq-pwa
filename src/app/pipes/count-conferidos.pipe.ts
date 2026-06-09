import { Pipe, PipeTransform } from '@angular/core';
import { ItemEntrega } from '../models/entrega.model';

@Pipe({ name: 'countConferidos', standalone: true, pure: false })
export class CountConferidosPipe implements PipeTransform {
  transform(items: ItemEntrega[]): number {
    return items.filter((i) => i.conferido).length;
  }
}
