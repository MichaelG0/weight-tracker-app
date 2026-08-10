import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: 'pureFn',
  pure: true,
})
export class PureFnPipe implements PipeTransform {
  // IMPORTANT: in order to pass the context to the pipe, the methods passed to
  // it must be defined as arrow functions in the component that they belong to.
  // This allows to bind the function reference and use the "this" scope within it.
  public transform(templateValue: any, fnReference: Function, ...fnArguments: any[]): any {
    fnArguments.unshift(templateValue);
    return fnReference.apply(null, fnArguments);
  }
}
