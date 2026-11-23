CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username varchar(24) NOT NULL, display_name varchar(50) NOT NULL,
 password_hash text NOT NULL, role text NOT NULL DEFAULT 'PLAYER' CHECK(role IN('PLAYER','ADMIN')),
 disabled boolean NOT NULL DEFAULT false, bio varchar(500) NOT NULL DEFAULT '', avatar bytea,
 settings jsonb NOT NULL DEFAULT '{}', rating integer NOT NULL DEFAULT 1000 CHECK(rating>=0),
 wins integer NOT NULL DEFAULT 0 CHECK(wins>=0), losses integer NOT NULL DEFAULT 0 CHECK(losses>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_unique ON users(lower(username));
CREATE TABLE sessions(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,csrf text NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX session_expiry ON sessions(expires_at);
CREATE TABLE friendships(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),requester uuid NOT NULL REFERENCES users ON DELETE CASCADE,recipient uuid NOT NULL REFERENCES users ON DELETE CASCADE,status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','ACCEPTED')),created_at timestamptz NOT NULL DEFAULT now(),CHECK(requester<>recipient));
CREATE UNIQUE INDEX friendship_pair ON friendships(LEAST(requester,recipient),GREATEST(requester,recipient));
CREATE TABLE messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sender uuid NOT NULL REFERENCES users ON DELETE CASCADE,recipient uuid NOT NULL REFERENCES users ON DELETE CASCADE,body varchar(2000) NOT NULL CHECK(length(body)>0),created_at timestamptz NOT NULL DEFAULT now(),read_at timestamptz);
CREATE INDEX messages_conversation ON messages(sender,recipient,created_at);
CREATE TABLE matches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),player1 uuid NOT NULL REFERENCES users,player2 uuid REFERENCES users,code text NOT NULL UNIQUE,ranked boolean NOT NULL DEFAULT false,status text NOT NULL DEFAULT 'WAITING' CHECK(status IN('WAITING','ACTIVE','COMPLETED','ABANDONED')),state jsonb NOT NULL, winner uuid REFERENCES users,result_applied boolean NOT NULL DEFAULT false,reason text,created_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,CHECK(player1 IS DISTINCT FROM player2));
CREATE TABLE invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sender uuid NOT NULL REFERENCES users,recipient uuid NOT NULL REFERENCES users,match_id uuid NOT NULL REFERENCES matches,status text NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','ACCEPTED','DECLINED')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor uuid,action text NOT NULL,details jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
