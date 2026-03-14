export default function BlogPostPage({ params }: { params: { slug: string } }) {
  return <main>Post: {params.slug}</main>;
}
