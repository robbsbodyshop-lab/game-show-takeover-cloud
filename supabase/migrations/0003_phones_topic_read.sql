-- 0003_phones_topic_read.sql
-- Realtime refuses to JOIN a private channel unless the user has a SELECT policy on
-- realtime.messages for that topic ("You do not have permissions to read from this Channel topic"),
-- even when an INSERT policy exists. Phones join room:<code>:phones:<team> to publish presses, so
-- they also need to read that one topic. It carries only their own team's presses and presence
-- (the stage never publishes there), so nothing hidden is exposed. Owner sessions keep reading all
-- eight topics through "room phones topic: owner reads" (0001).

create policy "room phones topic: own team reads"
  on realtime.messages for select to authenticated
  using (
    extension in ('broadcast', 'presence')
    and split_part((select realtime.topic()), ':', 1) = 'room'
    and split_part((select realtime.topic()), ':', 3) = 'phones'
    and split_part((select realtime.topic()), ':', 4) ~ '^[1-8]$'
    and split_part((select realtime.topic()), ':', 5) = ''
    and exists (
      select 1 from public.room_members m
      where m.room_code = split_part((select realtime.topic()), ':', 2)
        and m.user_id = (select auth.uid())
        and m.role = 'phone'
        and case
              when split_part((select realtime.topic()), ':', 4) ~ '^[1-8]$'
              then m.team = split_part((select realtime.topic()), ':', 4)::int
              else false
            end
    )
  );
