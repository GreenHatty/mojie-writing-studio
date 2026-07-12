import { AcceptInvitation } from '../../../src/features/invitations/accept-invitation';
type PageProps = { params: Promise<{ invitationId: string }> };
export default async function InvitationPage({ params }: PageProps) { return <AcceptInvitation token={(await params).invitationId} />; }
