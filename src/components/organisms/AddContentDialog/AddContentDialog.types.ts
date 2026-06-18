export interface AddContentDialogProps {
  className?: string;
  dataCy?: string;
}

export interface AddContentFormValues {
  postUrl: string;
}

export const ADD_CONTENT_FORM_DEFAULT_VALUES: AddContentFormValues = {
  postUrl: '',
};
