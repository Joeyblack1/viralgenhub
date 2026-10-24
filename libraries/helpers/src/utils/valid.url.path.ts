import {
  ValidationArguments,
  ValidatorConstraintInterface,
  ValidatorConstraint,
} from 'class-validator';

@ValidatorConstraint({ name: 'checkValidExtension', async: false })
export class ValidUrlExtension implements ValidatorConstraintInterface {
  validate(text: string, args: ValidationArguments) {
    return (
      !!text?.split?.('?')?.[0].endsWith('.png') ||
      !!text?.split?.('?')?.[0].endsWith('.jpg') ||
      !!text?.split?.('?')?.[0].endsWith('.jpeg') ||
      !!text?.split?.('?')?.[0].endsWith('.gif') ||
      !!text?.split?.('?')?.[0].endsWith('.webp') ||
      !!text?.split?.('?')?.[0].endsWith('.mp4')
    );
  }

  defaultMessage(args: ValidationArguments) {
    // here you can provide default error message if validation failed
    return (
      'File must have a valid extension: .png, .jpg, .jpeg, .gif, .webp, or .mp4'
    );
  }
}

// also used for media urls that don't come through a DTO, like pictures in a post body
export const isAllowedUploadPath = (text: string) => {
  if (!process.env.RESTRICT_UPLOAD_DOMAINS) {
    return true;
  }

  // Compare the host, not the string: a substring match let
  // `http://169.254.169.254/x.png?cdn.domain` through. The value may be a
  // bare domain or a URL, and a subdomain of it is accepted on a dot boundary.
  const allowed = process.env.RESTRICT_UPLOAD_DOMAINS.trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .split(/[/:?#]/)[0];

  let hostname: string;
  try {
    hostname = new URL(text || 'invalid url').hostname.toLowerCase();
  } catch {
    return false;
  }

  return hostname === allowed || hostname.endsWith('.' + allowed);
};

@ValidatorConstraint({ name: 'checkValidPath', async: false })
export class ValidUrlPath implements ValidatorConstraintInterface {
  validate(text: string, args: ValidationArguments) {
    return isAllowedUploadPath(text);
  }

  defaultMessage(args: ValidationArguments) {
    // here you can provide default error message if validation failed
    return (
      'URL must contain the domain: ' + process.env.RESTRICT_UPLOAD_DOMAINS + ' Make sure you first use the upload API route.'
    );
  }
}
