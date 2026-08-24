'use client';

import { Loader2 } from 'lucide-react';
import { Controller } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Card } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { RadioGroup, RadioGroupItem } from '@/atoms/RadioGroup/RadioGroup';
import { Typography } from '@/atoms/Typography/Typography';
import { useCopyrightForm } from '@/hooks/useCopyrightForm/useCopyrightForm';
import { COPYRIGHT_FORM_FIELDS, COPYRIGHT_ROLES } from '@/hooks/useCopyrightForm/useCopyrightForm.constants';
import type { CopyrightFormData } from '@/hooks/useCopyrightForm/useCopyrightForm.types';
import { formatUSDate } from '@/libs/utils/utils';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';

export function CopyrightForm() {
  const { form, onSubmit } = useCopyrightForm();
  const { isSubmitting, errors } = form.formState;
  const roleError = errors.role?.message;
  const currentDate = formatUSDate();
  return (
    <Container size="container" className="px-6 pb-12 xl:px-0">
      <form onSubmit={onSubmit}>
        <Card className="rounded-t-lg rounded-b-none border border-border p-8 md:p-12">
          <Container className="gap-6">
            <Typography as="h1" size="lg">
              {'Copyright Removal Request'}
            </Typography>

            <Typography size="sm" className="font-normal text-muted-foreground">
              {`Date: ${currentDate}`}
            </Typography>

            <Typography size="sm" className="font-normal text-muted-foreground">
              {'Synonym Software, S.A. de C.V. ("Synonym")'}
              <br />
              87 avenida norte, calle El Mirador, edificio Torre Futura, oficina 06, nivel 11, colonia Escalón, del
              municipio de San Salvador, departamento de San Salvador. Código postal 01101, República de El Salvador.
            </Typography>

            <Container overrideDefaults className="my-3 h-px w-full bg-border" aria-hidden="true" />

            <Container className="gap-6 rounded-lg bg-muted p-4">
              <Typography size="sm" className="font-normal text-muted-foreground">
                {'Dear Synonym:'}
                <br />
                <br />
                {'We write on behalf of:'}
              </Typography>
            </Container>

            <Typography size="md">{'Rights Owner Information'}</Typography>

            <Controller
              control={form.control}
              name={COPYRIGHT_FORM_FIELDS.ROLE}
              render={({ field }) => (
                <RadioGroup
                  name={field.name}
                  value={field.value ?? ''}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={isSubmitting}
                  className="gap-4 xl:auto-cols-fr xl:grid-flow-col"
                  aria-required
                  aria-invalid={Boolean(roleError) || undefined}
                  aria-errormessage={roleError ? 'copyright-role-error' : undefined}
                  aria-describedby={roleError ? 'copyright-role-error' : undefined}
                >
                  <RadioGroupItem value={COPYRIGHT_ROLES.RIGHTS_OWNER} label={'I am the rights owner'} />
                  <RadioGroupItem
                    value={COPYRIGHT_ROLES.REPORTING_ON_BEHALF}
                    label={'I am reporting on behalf of my organization or client'}
                  />
                </RadioGroup>
              )}
            />

            {roleError && (
              <Typography id="copyright-role-error" size="sm" className="font-normal text-destructive" role="alert">
                {roleError}
              </Typography>
            )}

            <ControlledInputField<CopyrightFormData>
              name="nameOwner"
              control={form.control}
              label={'Name of the rights owner'}
              labelHint={
                <Typography as="span" overrideDefaults className="text-xs normal-case">
                  {' '}
                  {'(This may be your full name or the name of the organization)'}
                </Typography>
              }
              placeholder={'Name of the rights owner'}
              maxLength={50}
              disabled={isSubmitting}
            />

            <Container overrideDefaults className="my-3 h-px w-full bg-border" aria-hidden="true" />

            <Container className="gap-6 rounded-lg bg-muted p-4">
              <Typography size="sm" className="font-normal text-muted-foreground">
                We hereby provide notice of copyright infringements pursuant to the terms of the Digital Millennium
                Copyright Act (the &quot;Act&quot;) and the Pubky Terms and Conditions. Copyright Owner is the owner of
                the copyrights in the following work(s) (collectively, the &quot;Work(s)&quot;):
              </Typography>
            </Container>

            <Container className="gap-8 xl:flex-row xl:justify-between">
              <ControlledTextareaField<CopyrightFormData>
                name="originalContentUrls"
                control={form.control}
                label={'Original Content URLs'}
                placeholder={'Enter URLs of your original content'}
                disabled={isSubmitting}
                className="min-w-0"
                textareaClassName="overflow-y-auto overflow-x-hidden break-words"
              />

              <ControlledTextareaField<CopyrightFormData>
                name="briefDescription"
                control={form.control}
                label={'Brief description of your original content'}
                placeholder={'Describe your original content'}
                disabled={isSubmitting}
                className="min-w-0"
                textareaClassName="overflow-y-auto overflow-x-hidden"
              />
            </Container>

            <Container overrideDefaults className="my-3 h-px w-full bg-border" aria-hidden="true" />

            <Container className="gap-6 rounded-lg bg-muted p-4">
              <Typography size="sm" className="font-normal text-muted-foreground">
                It has come to Copyright Owner&apos;s attention that your platform (the &quot;Platform&quot;) displays,
                provides access to or caches materials that infringe Copyright Owner&apos;s copyrights in the Work(s).
                The following is a list of the infringing material(s) and the URL(s), if applicable, at which the
                infringing material(s) are accessible on the Platform:
              </Typography>
            </Container>

            <Typography size="md">{'Infringing work details'}</Typography>

            <ControlledTextareaField<CopyrightFormData>
              name="infringingContentUrl"
              control={form.control}
              label={'Infringing Content URLs'}
              placeholder={'Enter URLs of infringing content'}
              disabled={isSubmitting}
              className="min-w-0"
              textareaClassName="overflow-y-auto overflow-x-hidden break-words"
            />

            <Container overrideDefaults className="my-3 h-px w-full bg-border" aria-hidden="true" />

            <Container className="gap-6 rounded-lg bg-muted p-4">
              <Typography size="sm" className="font-normal text-muted-foreground">
                We have a good faith belief that the use of the Works described in this letter are not authorized by
                Copyright Owner, any agent of Copyright Owner or any applicable law. The information in this
                notification is accurate. We swear under penalty of perjury that we are authorized to act on behalf of
                Copyright Owner with respect to the subject matter of this letter.
                <br />
                <br />
                We therefore request that you remove or disable access to the infringing materials as set forth in
                Section 512(c)(1)(C), Section 512(d)(3) and/or Section 512(b)(2)(E) of the Act, as applicable, and
                pursuant to the Pubky Terms and Conditions. Please contact the undersigned no later than one week from
                the date of this copyright removal request to confirm that the infringing materials have been removed or
                access disabled. The undersigned may be contacted at the telephone number, address and email address set
                forth below, as follows:
              </Typography>
            </Container>

            <Typography size="md">{'Contact Information'}</Typography>

            <Container className="gap-8 xl:flex-row xl:justify-between">
              <ControlledInputField<CopyrightFormData>
                name="firstName"
                control={form.control}
                label={'First Name'}
                placeholder={'Satoshi'}
                maxLength={30}
                disabled={isSubmitting}
              />

              <ControlledInputField<CopyrightFormData>
                name="lastName"
                control={form.control}
                label={'Last Name'}
                placeholder={'Nakamoto'}
                maxLength={30}
                disabled={isSubmitting}
              />
            </Container>

            <Container className="gap-8 xl:flex-row xl:justify-between">
              <ControlledInputField<CopyrightFormData>
                name="email"
                control={form.control}
                label={'Email'}
                placeholder={'email@example.com'}
                maxLength={100}
                disabled={isSubmitting}
              />

              <ControlledInputField<CopyrightFormData>
                name="phoneNumber"
                control={form.control}
                label={'Phone number'}
                placeholder={'000-000-0000'}
                maxLength={30}
                disabled={isSubmitting}
              />
            </Container>

            <Typography size="md">{'Address'}</Typography>

            <Container className="gap-8 xl:flex-row xl:justify-between">
              <ControlledInputField<CopyrightFormData>
                name="streetAddress"
                control={form.control}
                label={'Street address'}
                placeholder={'Street number and name'}
                maxLength={100}
                disabled={isSubmitting}
              />

              <ControlledInputField<CopyrightFormData>
                name="country"
                control={form.control}
                label={'Country'}
                placeholder={'United States'}
                maxLength={50}
                disabled={isSubmitting}
              />
            </Container>

            <Container className="gap-8 xl:flex-row xl:justify-between">
              <ControlledInputField<CopyrightFormData>
                name="city"
                control={form.control}
                label={'City'}
                placeholder={'City name'}
                maxLength={50}
                disabled={isSubmitting}
              />

              <ControlledInputField<CopyrightFormData>
                name="stateProvince"
                control={form.control}
                label={'State/Province'}
                placeholder={'State name'}
                maxLength={50}
                disabled={isSubmitting}
              />
            </Container>

            <ControlledInputField<CopyrightFormData>
              name="zipCode"
              control={form.control}
              label={'Zip code'}
              placeholder={'000000'}
              maxLength={20}
              disabled={isSubmitting}
            />

            <Container overrideDefaults className="my-3 h-px w-full bg-border" aria-hidden="true" />

            <Typography as="h2" size="md">
              {'Signature'}
            </Typography>

            <ControlledInputField<CopyrightFormData>
              name="signature"
              control={form.control}
              label={'Full Name as Signature'}
              placeholder={'Full name'}
              maxLength={100}
              disabled={isSubmitting}
            />
          </Container>
        </Card>

        <Card className="rounded-t-none rounded-b-lg border border-t-0 border-border p-8">
          <Container className="flex-row justify-end">
            <Button
              type="submit"
              disabled={isSubmitting}
              size="lg"
              className="w-auto"
              aria-label={isSubmitting ? 'Submitting...' : 'Submit Form'}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  {'Submitting...'}
                </>
              ) : (
                'Submit Form'
              )}
            </Button>
          </Container>
        </Card>
      </form>
    </Container>
  );
}
