<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Record extends Model
{
    protected $fillable = ['collection', 'key', 'data', 'rev', 'deleted', 'updated_by'];

    protected function casts(): array
    {
        return ['deleted' => 'boolean', 'rev' => 'integer'];
    }

    /** The decoded JSON document of this record. */
    public function document(): mixed
    {
        return json_decode($this->data, true);
    }
}
