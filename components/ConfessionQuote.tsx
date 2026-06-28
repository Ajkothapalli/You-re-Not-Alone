import { StyleSheet, Text, View } from 'react-native';
import { color, fontFamily } from '@/theme/tokens';

const QUOTES = [
  {
    text:   'There is no agony like bearing an untold story inside you.',
    author: 'Zora Neale Hurston',
  },
  {
    text:   "It's the confession, not the priest, that gives us absolution.",
    author: 'Oscar Wilde',
  },
  {
    text:   "We're only as sick as our secrets.",
    author: null,
  },
  {
    text:   'Until you make the unconscious conscious, it will direct your life and you will call it fate.',
    author: 'Carl Jung',
  },
  {
    text:   'To confess a fault freely is the next thing to being innocent of it.',
    author: 'Publilius Syrus',
  },
  {
    text:   'The cruelest lies are often told in silence.',
    author: 'Robert Louis Stevenson',
  },
  {
    text:   'Owning our story can be hard but not nearly as difficult as spending our lives running from it.',
    author: 'Brené Brown',
  },
  {
    text:   'We accept the love we think we deserve.',
    author: 'Stephen Chbosky',
  },
  {
    text:   'The truth is rarely pure and never simple.',
    author: 'Oscar Wilde',
  },
  {
    text:   'I am not what happened to me. I am what I choose to become.',
    author: 'Carl Jung',
  },
  {
    text:   'You own everything that happened to you.',
    author: 'Anne Lamott',
  },
  {
    text:   'The cave you fear to enter holds the treasure you seek.',
    author: 'Joseph Campbell',
  },
  {
    text:   'Shame dies when stories are told in safe places.',
    author: 'Ann Voskamp',
  },
  {
    text:   'Vulnerability sounds like truth and feels like courage.',
    author: 'Brené Brown',
  },
] as const;

// Rotates daily — same quote for all users on a given day, no server call needed.
function todaysQuote() {
  const day = Math.floor(Date.now() / 86_400_000);
  return QUOTES[day % QUOTES.length];
}

export default function ConfessionQuote() {
  const q = todaysQuote();
  return (
    <View style={styles.wrap}>
      <Text style={styles.mark}>"</Text>
      <Text style={styles.text}>{q.text}</Text>
      {q.author && <Text style={styles.author}>— {q.author}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems:  'center',
    paddingTop:  8,
    paddingBottom: 8,
    gap:         8,
  },
  mark: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   36,
    color:      color.dim,
    lineHeight: 28,
    opacity:    0.5,
  },
  text: {
    fontFamily: fontFamily.serifItalic,
    fontSize:   15,
    color:      color.dim,
    textAlign:  'center',
    lineHeight: 23,
    opacity:    0.85,
  },
  author: {
    fontFamily: fontFamily.sans,
    fontSize:   12,
    color:      color.dim,
    textAlign:  'center',
    opacity:    0.55,
    marginTop:  2,
  },
});
