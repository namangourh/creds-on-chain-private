import { useState } from 'react';
import { motion } from 'framer-motion';

interface Props {
  skill: string;
}

function toSlug(skill: string): string {
  return skill.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

export default function SkillTag({ skill }: Props) {
  const [imgError, setImgError] = useState(false);
  const slug = toSlug(skill);

  return (
    <motion.span
      className="skill-pill"
      whileHover={{ scale: 1.1, boxShadow: '0 0 12px rgba(20,241,112,0.28)' }}
      whileTap={{ scale: 0.93 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
    >
      {!imgError && (
        <img
          src={`https://cdn.simpleicons.org/${slug}`}
          alt=""
          width={14}
          height={14}
          onError={() => setImgError(true)}
          style={{ flexShrink: 0, display: 'block' }}
        />
      )}
      {skill}
    </motion.span>
  );
}
